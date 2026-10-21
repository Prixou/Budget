import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AI_PRICE, costOf } from '../js/ai.js';
import { runTool, TOOLS, toolInputSchema } from '../js/ai-tools.js';
import { buildDemoState } from '../js/demo.js';
import { normalizeState } from '../js/store.js';

const TODAY = '2026-10-21';
const state = normalizeState(buildDemoState(TODAY));

test('schémas stricts : objets fermés, toutes les propriétés requises', () => {
  for (const tool of TOOLS) {
    const schema = toolInputSchema(tool);
    assert.equal(schema.type, 'object');
    assert.equal(schema.additionalProperties, false);
    assert.deepEqual(schema.required, Object.keys(schema.properties), tool.name);
    assert.ok(tool.description.length > 20, tool.name);
    assert.match(tool.name, /^[a-z_]+$/);
  }
});

test('chaque outil répond sur les données d’exemple avec du JSON compact', () => {
  const inputs = {
    resume_du_mois: { mois: '' },
    depenses_par_categorie: { du: '', au: '', sens: 'depense' },
    rechercher_operations: { texte: '', categorie: 'courses', du: '2026-09-01', au: '', type: 'depense' },
    evolution_mensuelle: { nombre_de_mois: 6 },
    budgets_du_mois: { mois: '2026-09' },
  };
  for (const tool of TOOLS) {
    const out = runTool(tool.name, inputs[tool.name] || {}, state, TODAY);
    assert.ok(out && !out.erreur, `${tool.name} : ${out?.erreur}`);
    const size = JSON.stringify(out).length;
    assert.ok(size < 12000, `${tool.name} : ${size} caractères envoyés`);
  }
});

test('les chiffres de l’assistant sont ceux de l’application', () => {
  const month = runTool('resume_du_mois', { mois: '2026-09' }, state, TODAY);
  assert.equal(month.mois, '2026-09');
  assert.ok(month.revenus > 4000 && month.depenses > 1000);
  assert.ok(month.epargne_versee > 0, 'virements vers le livret et le PEA');
  assert.equal(month.reste_a_vivre, Math.round((month.revenus - month.depenses - month.epargne_versee) * 100) / 100);
  const search = runTool('rechercher_operations', { texte: 'loyer', categorie: '', du: '', au: '', type: 'tous' }, state, TODAY);
  assert.ok(search.nombre >= 8 && search.operations.every((o) => /loyer/i.test(o.libelle) && o.montant < 0));
  const fixed = runTool('charges_fixes', {}, state, TODAY);
  assert.ok(fixed.recurrences.length > 10 && fixed.epargne_programmee_par_mois > 0);
  const family = runTool('famille', {}, state, TODAY);
  assert.equal(family.mode_couple, true);
  assert.ok(family.bebe.a_epargner_avant_la_naissance > 0);
});

test('une saisie invalide renvoie une explication à Claude au lieu d’échouer', () => {
  assert.match(runTool('resume_du_mois', { mois: 'octobre' }, state, TODAY).erreur, /AAAA-MM/);
  assert.match(runTool('rechercher_operations', { texte: '', categorie: 'Licornes', du: '', au: '', type: 'tous' }, state, TODAY).erreur, /Catégorie inconnue/);
  assert.match(runTool('outil_inconnu', {}, state, TODAY).erreur, /inconnu/);
});

test('coût d’une réponse de Claude Haiku 5.5', () => {
  assert.deepEqual(AI_PRICE, { input: 0.1, output: 0.5 });
  // 10 000 jetons lus et 1 000 écrits : 0,001 $ + 0,0005 $ = 0,15 centime de dollar
  assert.ok(Math.abs(costOf({ input_tokens: 10000, output_tokens: 1000 }) - 0.15) < 1e-9);
  assert.equal(costOf(null), 0);
});
