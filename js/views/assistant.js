// Assistant : questions en langage courant sur le budget, réponses calculées sur les données locales.
import { AI_MODEL_LABEL, aiReady, aiSettings, askAssistant, explainError, formatDollars as dollars, monthSpend } from '../ai.js';
import { TOOL_LABELS } from '../ai-tools.js';
import { icon, toast } from '../ui.js';
import { escapeHtml, html, raw } from '../utils.js';

// Conversation de la session (non enregistrée) : [{ role: 'user' | 'assistant', text, cost? }]
const chat = { messages: [], busy: false, steps: [], draft: '' };

/** Mise en forme légère des réponses : gras, listes, paragraphes (le texte est échappé d'abord). */
function format(text) {
  const lines = escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .split('\n');
  let out = '';
  let list = false;
  for (const line of lines) {
    const item = line.match(/^\s*(?:[-•*]|\d+[.)])\s+(.*)$/);
    if (item) {
      if (!list) out += '<ul>';
      list = true;
      out += `<li>${item[1]}</li>`;
      continue;
    }
    if (list) out += '</ul>';
    list = false;
    if (line.trim()) out += `<p>${line}</p>`;
  }
  return out + (list ? '</ul>' : '');
}

function suggestions(state) {
  const list = ['Combien ai-je dépensé ce mois-ci, et où ?', 'Où puis-je économiser ?', 'Combien puis-je mettre de côté ce mois-ci ?', 'Mes abonnements me coûtent combien par an ?'];
  if (state.household?.enabled) list.splice(2, 0, 'Qui doit combien à qui entre nous ?');
  if (state.baby?.dueDate) list.push('Sommes-nous prêts financièrement pour l’arrivée de bébé ?');
  return list.slice(0, 5);
}

export default {
  id: 'assistant',
  title: 'Assistant',
  icon: 'chat',

  actions() {
    if (!chat.messages.length) return '';
    return html`<button type="button" class="btn btn-ghost" data-clear-chat>${icon('trash', { size: 16 })} <span class="desktop-only">Nouvelle conversation</span></button>`;
  },

  topbarMount(bar, { rerender }) {
    bar.querySelector('[data-clear-chat]')?.addEventListener('click', () => {
      chat.messages = [];
      rerender();
    });
  },

  render({ state }) {
    const settings = aiSettings(state);
    if (!aiReady(state)) {
      return html`<section class="card stack-v assistant-intro">
        <div><h2>Posez vos questions sur votre budget</h2>
        <p class="muted" style="margin-top:6px">« Combien a-t-on dépensé en restaurants ce mois-ci ? », « Puis-je me permettre 300 € de cadeaux en décembre ? » : l’assistant calcule la réponse sur vos propres chiffres. Il utilise ${AI_MODEL_LABEL}, le modèle le plus économique d’Anthropic.</p></div>
        <ol class="steps">
          <li>Créez un compte sur <a href="https://platform.claude.com" target="_blank" rel="noopener">platform.claude.com</a>, ajoutez quelques dollars de crédit et fixez une limite de dépense.</li>
          <li>Créez une clé API (menu « API Keys »).</li>
          <li>Collez-la dans <a href="#parametres">Paramètres → Intelligence artificielle</a>.</li>
        </ol>
        <div class="callout">${icon('info')}<div><strong>Coût :</strong> environ 0,2 centime par question et 0,05 centime par capture d’écran lue ; un plafond mensuel (1 $ par défaut) bloque toute dépense au-delà. <strong>Confidentialité :</strong> seuls les chiffres utiles à la réponse sont envoyés, uniquement quand vous posez une question ; par défaut, Anthropic n’utilise pas les données envoyées à son API pour entraîner ses modèles.</div></div>
        <div class="row"><a class="btn btn-primary" href="#parametres">${icon('settings', { size: 16 })} Configurer l’assistant</a></div>
      </section>`;
    }
    const spent = monthSpend(state);
    return html`<div class="assistant">
      <section class="card chat" aria-live="polite">
        ${chat.messages.length
          ? chat.messages.map(
              (m) => html`<div class="bubble bubble-${m.role}">${m.role === 'assistant' ? raw(format(m.text)) : m.text}${m.cost != null ? html`<span class="bubble-cost">${dollars(m.cost)}</span>` : ''}</div>`,
            )
          : html`<div class="chat-empty">${icon('chat', { size: 28 })}<p>Que voulez-vous savoir ?</p></div>`}
        ${chat.busy
          ? html`<div class="bubble bubble-assistant bubble-wait"><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span> ${chat.steps.length ? `Calcul : ${chat.steps.map((s) => TOOL_LABELS[s] || s).join(', ')}…` : 'Réflexion…'}</div>`
          : ''}
      </section>
      ${chat.messages.length ? '' : html`<div class="chips">${suggestions(state).map((q) => html`<button type="button" class="chip" data-ask="${q}">${q}</button>`)}</div>`}
      <form class="chat-form" id="chat-form">
        <label class="sr-only" for="chat-input">Votre question</label>
        <textarea class="input" id="chat-input" rows="2" maxlength="1000" placeholder="Posez une question sur votre budget…" ${chat.busy ? raw('disabled') : ''}>${chat.draft}</textarea>
        <button type="submit" class="btn btn-primary" ${chat.busy ? raw('disabled') : ''}>${icon('arrowUp', { size: 16 })} <span class="desktop-only">Envoyer</span></button>
      </form>
      <p class="muted small assistant-meta">${AI_MODEL_LABEL} · ce mois-ci ${dollars(spent)}${settings.monthlyCap > 0 ? ` sur ${dollars(settings.monthlyCap)} de plafond` : ''} · les réponses peuvent contenir des erreurs : vérifiez les montants importants.</p>
    </div>`;
  },

  mount(root, { rerender }) {
    const form = root.querySelector('#chat-form');
    if (!form) return;
    const input = form.querySelector('textarea');
    input.addEventListener('input', () => (chat.draft = input.value));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        form.requestSubmit();
      }
    });
    const ask = async (question) => {
      question = question.trim();
      if (!question || chat.busy) return;
      // Les échanges précédents (texte seul, 6 derniers) donnent le contexte sans alourdir la facture.
      const history = chat.messages.slice(-6).map((m) => ({ role: m.role, content: m.text }));
      chat.messages.push({ role: 'user', text: question });
      chat.busy = true;
      chat.steps = [];
      chat.draft = '';
      rerender();
      try {
        const answer = await askAssistant(question, history, {
          onStep: (name) => {
            if (!chat.steps.includes(name)) chat.steps.push(name);
            rerender();
          },
        });
        chat.messages.push({ role: 'assistant', text: answer.text, cost: answer.cost });
      } catch (error) {
        chat.messages.pop();
        chat.draft = question;
        toast(await explainError(error), { tone: 'error', duration: 8000 });
      } finally {
        chat.busy = false;
        chat.steps = [];
        rerender();
        document.getElementById('chat-input')?.focus();
        document.querySelector('#view .chat')?.lastElementChild?.scrollIntoView({ block: 'nearest' });
      }
    };
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      ask(input.value);
    });
    root.querySelectorAll('[data-ask]').forEach((b) => b.addEventListener('click', () => ask(b.dataset.ask)));
  },
};
