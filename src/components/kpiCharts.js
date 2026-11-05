/**
 * Dependency-free SVG chart builders. Pure functions: data in, markup string out.
 * All text is escaped by the caller-facing helpers below.
 */
export const esc = s => String(s ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

const W = 560, H = 220, M = { l: 40, r: 14, t: 14, b: 30 };

function scaleFns(min, max, n) {
  const iw = W - M.l - M.r, ih = H - M.t - M.b;
  return {
    x: i => M.l + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw),
    y: v => M.t + ih - ((v - min) / (max - min || 1)) * ih,
    ih,
  };
}
function niceRange(values, pad = 5) {
  const nums = values.filter(v => Number.isFinite(v));
  if (!nums.length) return [0, 100];
  let lo = Math.floor((Math.min(...nums) - pad) / 10) * 10, hi = Math.ceil((Math.max(...nums) + pad) / 10) * 10;
  lo = Math.max(0, lo); if (hi - lo < 20) hi = lo + 20;
  hi = lo + Math.ceil((hi - lo) / 40) * 40; // span is a multiple of 40 so the 4 gridlines land on multiples of 10
  return [lo, hi];
}
function axes(min, max, labels, sf) {
  const ticks = 4, parts = [];
  for (let i = 0; i <= ticks; i++) {
    const v = min + ((max - min) * i) / ticks, y = sf.y(v);
    parts.push(`<line x1="${M.l}" x2="${W - M.r}" y1="${y}" y2="${y}" stroke="#e2e6ea" stroke-width="1"/>` +
      `<text x="${M.l - 6}" y="${y + 3}" text-anchor="end" font-size="10" fill="#6b7380">${Math.round(v)}</text>`);
  }
  const step = Math.max(1, Math.ceil(labels.length / 7));
  const last = labels.length - 1;
  labels.forEach((l, i) => {
    // Always show the last label; skip a regular one that would sit right next to it.
    if (i === last || (i % step === 0 && last - i >= Math.ceil(step / 2))) {
      parts.push(`<text x="${sf.x(i)}" y="${H - 10}" text-anchor="middle" font-size="10" fill="#6b7380">${esc(l)}</text>`);
    }
  });
  return parts.join("");
}
function legend(items) {
  return `<div class="kpi-legend">${items.map(i => `<span><i style="background:${i.color};${i.dash ? "background:none;border-top:2px dashed " + i.color + ";height:0;" : ""}"></i>${esc(i.label)}</span>`).join("")}</div>`;
}
function wrap(title, svg, items, empty) {
  return `<div class="kpi-chart" role="img" aria-label="${esc(title)}">${empty ? `<div class="kpi-empty">${esc(empty)}</div>` : `<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet">${svg}</svg>`}${legend(items)}</div>`;
}

/**
 * series: [{ label, color, values:[number|null], dash?:bool }]. A constant `target` draws a reference line.
 * split: index where the data stops being "actual" (draw remaining points of series with `projectFrom` dashed).
 */
export function lineChart({ title, labels, series, target, targetLabel, emptyText }) {
  const all = series.flatMap(s => s.values).concat(target != null ? [target] : []);
  if (!labels.length || !series.some(s => s.values.some(v => Number.isFinite(v)))) {
    return wrap(title, "", series.map(s => ({ color: s.color, label: s.label })), emptyText || "Not enough data yet.");
  }
  const [min, max] = niceRange(all);
  const sf = scaleFns(min, max, labels.length);
  let svg = axes(min, max, labels, sf);
  if (target != null) {
    svg += `<line x1="${M.l}" x2="${W - M.r}" y1="${sf.y(target)}" y2="${sf.y(target)}" stroke="#a2191f" stroke-width="1.5" stroke-dasharray="5 4"/>` +
      `<text x="${W - M.r}" y="${sf.y(target) - 4}" text-anchor="end" font-size="10" fill="#a2191f">${esc(targetLabel || "Target")} ${target}%</text>`;
  }
  for (const s of series) {
    let d = "", open = false;
    s.values.forEach((v, i) => {
      if (!Number.isFinite(v)) { open = false; return; }
      d += `${open ? "L" : "M"}${sf.x(i).toFixed(1)},${sf.y(v).toFixed(1)} `; open = true;
    });
    svg += `<path d="${d.trim()}" fill="none" stroke="${s.color}" stroke-width="2"${s.dash ? ' stroke-dasharray="6 4"' : ""}/>`;
    s.values.forEach((v, i) => {
      if (Number.isFinite(v) && (labels.length <= 14 || i === s.values.length - 1)) {
        svg += `<circle cx="${sf.x(i).toFixed(1)}" cy="${sf.y(v).toFixed(1)}" r="3" fill="${s.color}"><title>${esc(s.label)} ${esc(labels[i])}: ${v}</title></circle>`;
      }
    });
  }
  const items = series.map(s => ({ color: s.color, label: s.label, dash: s.dash }));
  if (target != null) items.push({ color: "#a2191f", label: targetLabel || "Target", dash: true });
  return wrap(title, svg, items);
}

/** Stacked bars. stacks: [{label,color,values:[n]}] */
export function stackedBarChart({ title, labels, stacks, emptyText }) {
  const totals = labels.map((_, i) => stacks.reduce((s, st) => s + (st.values[i] || 0), 0));
  if (!labels.length) return wrap(title, "", stacks.map(s => ({ color: s.color, label: s.label })), emptyText || "Not enough data yet.");
  const max = Math.max(4, Math.ceil(Math.max(...totals) / 4) * 4);
  const sf = scaleFns(0, max, labels.length);
  let svg = axes(0, max, labels, sf);
  const bw = Math.max(6, Math.min(34, (W - M.l - M.r) / labels.length - 6));
  labels.forEach((l, i) => {
    let acc = 0;
    stacks.forEach(st => {
      const v = st.values[i] || 0; if (!v) return;
      const y1 = sf.y(acc + v), y0 = sf.y(acc);
      svg += `<rect x="${(sf.x(i) - bw / 2).toFixed(1)}" y="${y1.toFixed(1)}" width="${bw}" height="${(y0 - y1).toFixed(1)}" fill="${st.color}"><title>${esc(st.label)} ${esc(l)}: ${v}</title></rect>`;
      acc += v;
    });
  });
  return wrap(title, svg, stacks.map(s => ({ color: s.color, label: s.label })));
}

/**
 * 90-day timeline strip for the future-events calendar.
 * events: [{date,type,label}], startISO/endISO bounds (ms parser supplied by caller via dayIndex).
 */
export function timelineStrip({ startMs, days, events, today }) {
  const w = 560, h = 70, l = 8, r = 8, iw = w - l - r;
  const colors = { holiday: "#198038", project_end: "#a2191f", contract_transition: "#0f62fe" };
  const xOf = ms => l + Math.min(1, Math.max(0, (ms - startMs) / (days * 86400000))) * iw;
  let svg = `<line x1="${l}" x2="${w - r}" y1="34" y2="34" stroke="#c4c9d0" stroke-width="2"/>`;
  for (let m = 0; m <= days; m += 30) {
    const x = l + (m / days) * iw;
    svg += `<line x1="${x}" x2="${x}" y1="29" y2="39" stroke="#6b7380"/><text x="${x}" y="58" text-anchor="middle" font-size="10" fill="#6b7380">${m === 0 ? esc(today) : "+" + m + "d"}</text>`;
  }
  events.forEach((e, i) => {
    const ms = Date.parse(e.date + "T00:00:00Z");
    if (Number.isNaN(ms) || ms < startMs || ms > startMs + days * 86400000) return;
    const x = xOf(ms), up = i % 2 === 0, c = colors[e.type] || "#6b7380";
    svg += `<circle cx="${x.toFixed(1)}" cy="34" r="5" fill="${c}"><title>${esc(e.date)} · ${esc(e.label)}</title></circle>` +
      `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${up ? 29 : 39}" y2="${up ? 16 : 52}" stroke="${c}"/>`;
  });
  return `<div class="kpi-chart" role="img" aria-label="Future events timeline"><svg viewBox="0 0 ${w} ${h}" width="100%">${svg}</svg>` +
    legend([{ color: colors.holiday, label: "Holiday" }, { color: colors.project_end, label: "Project end" }, { color: colors.contract_transition, label: "Contract transition" }]) + `</div>`;
}
