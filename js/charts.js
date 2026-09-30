// Graphiques SVG dessinés à la largeur réelle de leur conteneur.
import { escapeHtml, formatMoney, formatPercent, html, raw } from './utils.js';

const registry = new Map();
let nextId = 1;
let observer = null;

/** Vide le registre (à appeler avant chaque rendu de vue). */
export function resetCharts() {
  registry.clear();
  observer?.disconnect();
}

/** Emplacement d'un graphique ; le dessin se fait dans mountCharts(). */
export function chartSlot(spec) {
  const id = `chart-${nextId++}`;
  registry.set(id, spec);
  const height = spec.height || 240;
  return html`<div class="chart" data-chart-id="${id}" style="height:${height}px" role="img" aria-label="${spec.label || ''}"></div>`;
}

export function mountCharts(root) {
  if (!observer && typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver((entries) => {
      for (const entry of entries) draw(entry.target);
    });
  }
  root.querySelectorAll('[data-chart-id]').forEach((el) => {
    draw(el);
    observer?.observe(el);
  });
}

function draw(el) {
  const spec = registry.get(el.dataset.chartId);
  if (!spec) return;
  const width = Math.floor(el.clientWidth);
  if (width < 40) return;
  if (el._drawnWidth === width) return;
  el._drawnWidth = width;
  const height = spec.height || 240;
  const renderers = { columns: columnChart, diverging: divergingChart, line: lineChart };
  el.innerHTML = renderers[spec.type](spec, width, height);
  if (spec.type === 'line') attachCrosshair(el, spec, width, height);
}

/* ------------------------------------------------------------------ */
/* Échelles                                                            */
/* ------------------------------------------------------------------ */

function niceStep(raw) {
  if (raw <= 0) return 1;
  const exp = Math.floor(Math.log10(raw));
  const f = raw / 10 ** exp;
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nf * 10 ** exp;
}

export function niceScale(min, max, count = 4) {
  if (min === max) {
    if (min === 0) max = 10000;
    else {
      min -= Math.abs(min) * 0.1;
      max += Math.abs(max) * 0.1;
    }
  }
  const step = niceStep((max - min) / count);
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v));
  return { lo, hi, ticks };
}

const axisLabel = (cents) => formatMoney(cents, { decimals: false, compact: true });

function estimateTextWidth(text, size = 11) {
  return text.length * size * 0.58;
}

function yAxis(scale, y, left, right) {
  return scale.ticks
    .map((v) => {
      const yy = y(v);
      return `<line class="grid${v === 0 ? ' baseline' : ''}" x1="${left}" x2="${right}" y1="${yy}" y2="${yy}"></line>
        <text class="tick" x="${left - 8}" y="${yy}" text-anchor="end" dominant-baseline="middle">${escapeHtml(axisLabel(v))}</text>`;
    })
    .join('');
}

function leftMargin(scale) {
  return Math.ceil(Math.max(...scale.ticks.map((v) => estimateTextWidth(axisLabel(v))))) + 14;
}

/** Barre verticale avec extrémité arrondie (4px) côté données, carrée côté base. */
function barPath(x, yBase, yEnd, w, radius = 4) {
  const h = Math.abs(yBase - yEnd);
  if (h < 0.5) return '';
  const r = Math.min(radius, w / 2, h);
  if (yEnd < yBase) {
    return `M${x},${yBase}V${yEnd + r}Q${x},${yEnd} ${x + r},${yEnd}H${x + w - r}Q${x + w},${yEnd} ${x + w},${yEnd + r}V${yBase}Z`;
  }
  return `M${x},${yBase}V${yEnd - r}Q${x},${yEnd} ${x + r},${yEnd}H${x + w - r}Q${x + w},${yEnd} ${x + w},${yEnd - r}V${yBase}Z`;
}

function tipAttr(title, rows) {
  return escapeHtml(JSON.stringify({ t: title, r: rows }));
}

function xLabelEvery(n, plotW) {
  const minSpacing = 44;
  return Math.max(1, Math.ceil((n * minSpacing) / plotW));
}

/* ------------------------------------------------------------------ */
/* Colonnes groupées                                                   */
/* ------------------------------------------------------------------ */

/**
 * spec : { labels: [..], tipLabels: [..], series: [{ label, color, values }] }
 */
function columnChart(spec, W, H) {
  const { labels, series } = spec;
  const all = series.flatMap((s) => s.values);
  const scale = niceScale(0, Math.max(0, ...all));
  const top = 10;
  const bottom = 26;
  const left = leftMargin(scale);
  const right = 6;
  const plotW = W - left - right;
  const plotH = H - top - bottom;
  const y = (v) => top + plotH - ((v - scale.lo) / (scale.hi - scale.lo)) * plotH;
  const n = labels.length;
  const band = plotW / n;
  const k = series.length;
  const gap = 2;
  const barW = Math.max(2, Math.min(24, (band * 0.72 - gap * (k - 1)) / k));
  const groupW = barW * k + gap * (k - 1);
  const every = xLabelEvery(n, plotW);

  let out = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;
  out += yAxis(scale, y, left, W - right);
  labels.forEach((label, i) => {
    const x0 = left + band * i + (band - groupW) / 2;
    const rows = series.map((s) => [s.label, formatMoney(s.values[i]), s.color]);
    out += `<g class="mark-group" tabindex="0" data-tip="${tipAttr(spec.tipLabels?.[i] || label, rows)}">`;
    out += `<rect class="hit" x="${left + band * i}" y="${top}" width="${band}" height="${plotH}" fill="transparent"></rect>`;
    series.forEach((s, j) => {
      const d = barPath(x0 + j * (barW + gap), y(0), y(s.values[i]), barW);
      if (d) out += `<path class="bar" d="${d}" fill="var(${s.color})"></path>`;
    });
    out += `</g>`;
    if (i % every === 0) {
      out += `<text class="tick" x="${left + band * i + band / 2}" y="${H - 8}" text-anchor="middle">${escapeHtml(label)}</text>`;
    }
  });
  out += `</svg>`;
  return out;
}

/* ------------------------------------------------------------------ */
/* Colonnes divergentes (solde mensuel positif / négatif)              */
/* ------------------------------------------------------------------ */

function divergingChart(spec, W, H) {
  const { labels, values } = spec;
  const scale = niceScale(Math.min(0, ...values), Math.max(0, ...values));
  const top = 10;
  const bottom = 26;
  const left = leftMargin(scale);
  const right = 6;
  const plotW = W - left - right;
  const plotH = H - top - bottom;
  const y = (v) => top + plotH - ((v - scale.lo) / (scale.hi - scale.lo)) * plotH;
  const n = labels.length;
  const band = plotW / n;
  const barW = Math.max(2, Math.min(24, band * 0.6));
  const every = xLabelEvery(n, plotW);
  let out = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;
  out += yAxis(scale, y, left, W - right);
  values.forEach((v, i) => {
    const x = left + band * i + (band - barW) / 2;
    const positive = v >= 0;
    const color = positive ? '--pos' : '--neg';
    const rows = [[spec.seriesLabel || 'Solde', formatMoney(v, { sign: 'always' }), color]];
    out += `<g class="mark-group" tabindex="0" data-tip="${tipAttr(spec.tipLabels?.[i] || labels[i], rows)}">`;
    out += `<rect class="hit" x="${left + band * i}" y="${top}" width="${band}" height="${plotH}" fill="transparent"></rect>`;
    const d = barPath(x, y(0), y(v), barW);
    if (d) out += `<path class="bar" d="${d}" fill="var(${color})"></path>`;
    out += `</g>`;
    if (i % every === 0) out += `<text class="tick" x="${left + band * i + band / 2}" y="${H - 8}" text-anchor="middle">${escapeHtml(labels[i])}</text>`;
  });
  out += `</svg>`;
  return out;
}

/* ------------------------------------------------------------------ */
/* Courbe avec aire (évolution du solde)                               */
/* ------------------------------------------------------------------ */

function lineGeometry(spec, W, H) {
  const { values } = spec;
  const series = spec.series || [{ label: spec.seriesLabel || 'Solde', color: '--series-1', values }];
  const all = series.flatMap((s) => s.values);
  const min = Math.min(...all);
  const max = Math.max(...all);
  const scale = niceScale(spec.zeroBased ? Math.min(0, min) : min, max);
  const top = 14;
  const bottom = 26;
  const left = leftMargin(scale);
  const endLabel = axisLabel(series[0].values[series[0].values.length - 1] ?? 0);
  const right = Math.max(12, Math.ceil(estimateTextWidth(endLabel, 12)) + 14);
  const plotW = W - left - right;
  const plotH = H - top - bottom;
  const n = series[0].values.length;
  const x = (i) => left + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v) => top + plotH - ((v - scale.lo) / (scale.hi - scale.lo)) * plotH;
  return { series, scale, top, bottom, left, right, plotW, plotH, n, x, y };
}

function lineChart(spec, W, H) {
  const g = lineGeometry(spec, W, H);
  const { series, scale, top, left, plotH, n, x, y } = g;
  const every = xLabelEvery(n, g.plotW);
  let out = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;
  out += yAxis(scale, y, left, W - g.right);
  series.forEach((s, si) => {
    const pts = s.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
    if (si === 0 && series.length === 1) {
      const baseY = y(Math.max(scale.lo, Math.min(0, scale.hi)));
      out += `<path class="area" d="M${x(0)},${baseY}L${pts.join('L')}L${x(n - 1)},${baseY}Z" fill="var(${s.color})"></path>`;
    }
    out += `<polyline class="line" points="${pts.join(' ')}" stroke="var(${s.color})"></polyline>`;
    const last = s.values[n - 1];
    out += `<circle class="dot" cx="${x(n - 1)}" cy="${y(last)}" r="4" fill="var(${s.color})"></circle>`;
    if (si === 0) {
      out += `<text class="end-label" x="${x(n - 1) + 8}" y="${y(last)}" dominant-baseline="middle">${escapeHtml(axisLabel(last))}</text>`;
    }
  });
  spec.labels.forEach((label, i) => {
    if (i % every === 0 || i === n - 1) {
      if (i !== n - 1 && n - 1 - i < every) return;
      out += `<text class="tick" x="${x(i)}" y="${H - 8}" text-anchor="middle">${escapeHtml(label)}</text>`;
    }
  });
  out += `<line class="crosshair" x1="0" x2="0" y1="${top}" y2="${top + plotH}" visibility="hidden"></line>`;
  out += series.map((s) => `<circle class="focus-dot" r="4" fill="var(${s.color})" visibility="hidden"></circle>`).join('');
  out += `<rect class="overlay" x="${left}" y="${top}" width="${g.plotW}" height="${plotH}" fill="transparent" tabindex="0"></rect>`;
  out += `</svg>`;
  return out;
}

function attachCrosshair(el, spec, W, H) {
  const g = lineGeometry(spec, W, H);
  const svg = el.querySelector('svg');
  const overlay = svg.querySelector('.overlay');
  const cross = svg.querySelector('.crosshair');
  const dots = [...svg.querySelectorAll('.focus-dot')];
  let focusIndex = g.n - 1;
  const show = (i) => {
    focusIndex = i;
    const cx = g.x(i);
    cross.setAttribute('x1', cx);
    cross.setAttribute('x2', cx);
    cross.setAttribute('visibility', 'visible');
    dots.forEach((dot, si) => {
      dot.setAttribute('cx', cx);
      dot.setAttribute('cy', g.y(g.series[si].values[i]));
      dot.setAttribute('visibility', 'visible');
    });
    const rect = el.getBoundingClientRect();
    const rows = g.series.map((s) => [s.label, formatMoney(s.values[i]), s.color]);
    showTooltip({ t: spec.tipLabels?.[i] || spec.labels[i], r: rows }, rect.left + cx, rect.top + g.y(g.series[0].values[i]));
  };
  const hide = () => {
    cross.setAttribute('visibility', 'hidden');
    dots.forEach((d) => d.setAttribute('visibility', 'hidden'));
    hideTooltip();
  };
  const indexAt = (clientX) => {
    const rect = svg.getBoundingClientRect();
    const px = clientX - rect.left;
    const ratio = (px - g.left) / g.plotW;
    return Math.max(0, Math.min(g.n - 1, Math.round(ratio * (g.n - 1))));
  };
  overlay.addEventListener('pointermove', (e) => show(indexAt(e.clientX)));
  overlay.addEventListener('pointerdown', (e) => show(indexAt(e.clientX)));
  overlay.addEventListener('pointerleave', hide);
  overlay.addEventListener('focus', () => show(focusIndex));
  overlay.addEventListener('blur', hide);
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') show(Math.max(0, focusIndex - 1));
    else if (e.key === 'ArrowRight') show(Math.min(g.n - 1, focusIndex + 1));
    else return;
    e.preventDefault();
  });
}

/* ------------------------------------------------------------------ */
/* Info-bulle partagée                                                 */
/* ------------------------------------------------------------------ */

let tooltipEl = null;

function ensureTooltip() {
  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'tooltip';
    tooltipEl.setAttribute('role', 'tooltip');
    tooltipEl.hidden = true;
    document.body.appendChild(tooltipEl);
  }
  return tooltipEl;
}

export function showTooltip(data, clientX, clientY) {
  const el = ensureTooltip();
  el.replaceChildren();
  const title = document.createElement('div');
  title.className = 'tooltip-title';
  title.textContent = data.t;
  el.appendChild(title);
  for (const [label, value, color] of data.r) {
    const row = document.createElement('div');
    row.className = 'tooltip-row';
    const key = document.createElement('span');
    key.className = 'tooltip-key';
    key.style.background = `var(${color})`;
    const val = document.createElement('strong');
    val.textContent = value;
    const lab = document.createElement('span');
    lab.className = 'tooltip-label';
    lab.textContent = label;
    row.append(key, val, lab);
    el.appendChild(row);
  }
  el.hidden = false;
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  let left = clientX + 14;
  if (left + w > window.innerWidth - 8) left = clientX - w - 14;
  let top = clientY - h - 12;
  if (top < 8) top = clientY + 16;
  el.style.left = `${Math.max(8, left)}px`;
  el.style.top = `${top}px`;
}

export function hideTooltip() {
  if (tooltipEl) tooltipEl.hidden = true;
}

/** Info-bulles des barres (délégation d'événements, une seule fois). */
export function installTooltipHandlers() {
  const find = (target) => target.closest?.('[data-tip]');
  document.addEventListener('pointermove', (e) => {
    const el = find(e.target);
    if (!el) return;
    try {
      showTooltip(JSON.parse(el.dataset.tip), e.clientX, e.clientY);
    } catch {
      /* info-bulle invalide ignorée */
    }
  });
  document.addEventListener('pointerout', (e) => {
    if (find(e.target) && !find(e.relatedTarget || document.body)) hideTooltip();
  });
  document.addEventListener('focusin', (e) => {
    const el = find(e.target);
    if (!el) return;
    const r = el.getBoundingClientRect();
    try {
      showTooltip(JSON.parse(el.dataset.tip), r.left + r.width / 2, r.top);
    } catch {
      /* ignoré */
    }
  });
  document.addEventListener('focusout', (e) => {
    if (find(e.target)) hideTooltip();
  });
  window.addEventListener('scroll', hideTooltip, { passive: true });
}

/* ------------------------------------------------------------------ */
/* Composants HTML                                                     */
/* ------------------------------------------------------------------ */

/** Barres horizontales classées (une seule teinte). rows : [{ label, icon, value, share, sub }] */
export function hbars(rows, { max = null, valueFormat = (v) => formatMoney(v) } = {}) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value));
  return html`<ul class="hbars">
    ${rows.map(
      (r) => html`<li class="hbar-row">
        <span class="hbar-label">${r.icon ? html`<span class="hbar-icon" aria-hidden="true">${r.icon}</span>` : ''}<span class="hbar-name">${r.label}</span></span>
        <span class="hbar-value money">${valueFormat(r.value)}</span>
        <span class="hbar-track" aria-hidden="true"><span class="hbar-fill" style="width:${Math.max(0.5, (r.value / top) * 100).toFixed(2)}%"></span></span>
        <span class="hbar-sub">${r.sub ?? (r.share != null ? formatPercent(r.share, 1) : '')}</span>
      </li>`,
    )}
  </ul>`;
}

/** Barre empilée à 100 % avec légende. segments : [{ label, value, color, target }] */
export function stackedBar(segments, { total = null } = {}) {
  const sumValues = total ?? segments.reduce((a, s) => a + Math.max(0, s.value), 0);
  const visible = segments.filter((s) => s.value > 0);
  return html`<div class="stack" role="img" aria-label="${segments.map((s) => `${s.label} ${formatPercent(sumValues ? s.value / sumValues : 0)}`).join(', ')}">
      ${visible.map(
        (s) => html`<span class="stack-seg" style="flex-grow:${s.value};background:var(${s.color})" data-tip="${JSON.stringify({ t: s.label, r: [[formatPercent(sumValues ? s.value / sumValues : 0, 1), formatMoney(s.value), s.color]] })}"></span>`,
      )}
      ${visible.length ? '' : html`<span class="stack-empty"></span>`}
    </div>
    <ul class="legend legend-stack">
      ${segments.map(
        (s) => html`<li>
          <span class="swatch" style="background:var(${s.color})"></span>
          <span class="legend-label">${s.label}</span>
          <strong class="money">${formatMoney(s.value)}</strong>
          <span class="muted">${formatPercent(sumValues ? s.value / sumValues : 0)}${s.target != null ? ` · cible ${formatPercent(s.target)}` : ''}</span>
        </li>`,
      )}
    </ul>`;
}

/** Jauge : ratio (0..∞), état 'ok' | 'warning' | 'over' | 'done'. */
export function meter(ratio, status = 'ok', label = '') {
  if (status === 'full') status = 'ok';
  const pct = Math.max(0, Math.min(1, ratio || 0)) * 100;
  return html`<div class="meter meter-${status}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round((ratio || 0) * 100)}" aria-label="${label}">
    <span class="meter-fill" style="width:${pct.toFixed(1)}%"></span>
  </div>`;
}

/** Légende de séries (≥ 2 séries). */
export function legend(items) {
  return html`<ul class="legend">
    ${items.map((i) => html`<li><span class="swatch${i.line ? ' swatch-line' : ''}" style="background:var(${i.color})"></span>${i.label}</li>`)}
  </ul>`;
}

export { raw };
