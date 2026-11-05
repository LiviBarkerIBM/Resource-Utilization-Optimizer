/**
 * KPI Framework panel (Layer 1 inputs & triggers + Layer 2 optimizer KPIs).
 *
 * mountKpiPanel(container, deps) where deps = {
 *   getConsultants(), getRoles(), calcUtilization(c), scoreConsultant(c, r),
 *   viewRole(roleId), XLSX
 * }
 * The panel only *reads* roster/role data and calls the injected functions; it never mutates them.
 * Uses event delegation (data-action attributes) so it needs no window globals.
 */
import { computeFramework, validateConfig, validateForecastRows, validateEventRows, DEFAULT_CONFIG, EVENT_TYPES, parseDate, todayISO, addDays } from "../engine/kpi.js";
import * as store from "../data/kpiStore.js";
import { sampleForecast, sampleEvents, sampleHistory, DEMO_AS_OF } from "../data/kpiSamples.js";
import { lineChart, stackedBarChart, timelineStrip, esc } from "./kpiCharts.js";

const TYPE_LABEL = { holiday: "Holiday", project_end: "Project end", contract_transition: "Contract transition" };
const REC_LABEL = { allocate: "Allocate", rebalance: "Rebalance", develop: "Develop / redeploy" };
const BASIS_LABEL = { "weekly-hours": "weekly-hours sheet", allocations: "allocations", estimated: "estimated" };

export function mountKpiPanel(container, deps) {
  let state;
  let fw = null;
  const ui = { open: new Set(["risks"]), expanded: new Set(), msgs: {}, recFilter: "open" };

  // ── State bootstrap ────────────────────────────────────────────────────────
  function bootstrap() {
    if (store.hasSavedState()) { state = store.loadState(); return; }
    state = {
      config: { ...DEFAULT_CONFIG, asOfDate: DEMO_AS_OF, overrides: {} },
      forecast: sampleForecast(), events: sampleEvents(), history: sampleHistory(), recStates: {},
    };
    persistAll();
  }
  function persistAll() {
    store.saveConfig(state.config); store.saveForecast(state.forecast); store.saveEvents(state.events);
    store.saveHistory(state.history); store.saveRecStates(state.recStates);
  }
  const isDemo = () => state.config.asOfDate === DEMO_AS_OF;

  // ── Compute ────────────────────────────────────────────────────────────────
  function compute() {
    fw = computeFramework({
      consultants: deps.getConsultants(), roles: deps.getRoles(),
      forecast: state.forecast, events: state.events, config: state.config,
      recStates: state.recStates, history: state.history,
      calcUtilization: deps.calcUtilization, scoreConsultant: deps.scoreConsultant,
    });
    // Record today's snapshot so trend + forecast-accuracy KPIs accumulate over time.
    const prev = state.history.find(s => s.date === fw.snapshot.date);
    if (!prev || JSON.stringify({ ...prev, demo: undefined }) !== JSON.stringify(fw.snapshot)) {
      state.history = store.upsertSnapshot(state.history, fw.snapshot);
      store.saveHistory(state.history);
      fw.accuracy = computeFramework({ ...lastInputs(), history: state.history }).accuracy;
      fw.kpis.forecastAccuracy = fw.accuracy;
    }
  }
  const lastInputs = () => ({
    consultants: deps.getConsultants(), roles: deps.getRoles(), forecast: state.forecast, events: state.events,
    config: state.config, recStates: state.recStates, calcUtilization: deps.calcUtilization, scoreConsultant: deps.scoreConsultant,
  });

  // ── Render helpers ─────────────────────────────────────────────────────────
  const pct = v => (v === null || v === undefined ? "—" : `${v}%`);
  const sevBadge = s => `<span class="badge ${s === "high" ? "badge-red" : s === "medium" ? "badge-yellow" : "badge-green"}">${esc(s)}</span>`;
  const msgBlock = key => {
    const m = ui.msgs[key];
    if (!m) return "";
    const list = m.items && m.items.length ? `<ul>${m.items.slice(0, 8).map(i => `<li>${esc(i)}</li>`).join("")}${m.items.length > 8 ? `<li>…and ${m.items.length - 8} more</li>` : ""}</ul>` : "";
    return `<div class="kpi-msg ${m.kind}">${esc(m.text)}${list}</div>`;
  };
  const section = (id, title, count, body) => `
    <div class="kpi-sec">
      <div class="kpi-sec-head" data-action="toggle-sec" data-id="${id}">${esc(title)}${count !== null ? `<span class="kpi-count">${count}</span>` : ""}<span class="kpi-chev">${ui.open.has(id) ? "▲" : "▼"}</span></div>
      ${ui.open.has(id) ? `<div class="kpi-sec-body">${body}</div>` : ""}
    </div>`;

  // ── Layer 1 ────────────────────────────────────────────────────────────────
  function renderConfig() {
    const c = state.config;
    const f = (k, label, hint, min, max) => `<div class="kpi-field"><label for="kpi-cfg-${k}">${esc(label)}</label><input id="kpi-cfg-${k}" data-cfg="${k}" type="number" min="${min}" max="${max}" step="1" value="${esc(c[k])}"><div class="kpi-hint">${esc(hint)}</div></div>`;
    const consultants = deps.getConsultants();
    const ovr = Object.entries(c.overrides || {}).map(([id, v]) => {
      const cons = consultants.find(x => x.id === id);
      return `<span class="alloc-chip">${esc(cons ? cons.name : id)}: ${esc(v)}% <a href="#" data-action="del-override" data-id="${esc(id)}" style="color:var(--red);margin-left:4px;text-decoration:none;" aria-label="Remove override">×</a></span>`;
    }).join("") || `<span class="kpi-note">No individual overrides — everyone uses the default threshold.</span>`;
    return `
      <div class="kpi-form">
        ${f("consultantThresholdPct", "Consultant utilization threshold (%)", "Below this ⇒ bench risk", 1, 100)}
        ${f("practiceTargetPct", "Practice chargeability target (%)", "Baseline 75%", 1, 100)}
        ${f("horizonDays", "Forecast horizon (days)", "Default 90", 14, 180)}
        <div class="kpi-field"><label for="kpi-cfg-asOfDate">As-of date</label><input id="kpi-cfg-asOfDate" data-cfg="asOfDate" type="date" value="${esc(c.asOfDate)}"><div class="kpi-hint">Blank = today</div></div>
        ${f("minMatchScore", "Min match score", "Uses existing 0–100 candidate score", 0, 100)}
        ${f("minSkillCoverage", "Min required-skill coverage (%)", "Share of demand's required skills held", 0, 100)}
        ${f("unsignedRoleProbability", "Unsigned open-role probability (%)", "Weight for roles without a signed contract", 0, 100)}
      </div>
      <div class="kpi-row">
        <button class="kpi-btn kpi-primary" data-action="save-config">Save thresholds</button>
        <button class="kpi-btn kpi-ghost" data-action="config-defaults">Restore defaults</button>
        <button class="kpi-btn kpi-ghost" data-action="config-today">Use today's date</button>
      </div>
      ${msgBlock("config")}
      <div class="kpi-box-title" style="margin-top:12px;">Individual threshold overrides</div>
      <div class="kpi-row">
        <select id="kpi-ovr-id" aria-label="Consultant" style="border:1px solid var(--border);border-radius:5px;padding:5px 7px;font-size:12px;">${consultants.map(x => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join("")}</select>
        <input id="kpi-ovr-val" type="number" min="1" max="100" placeholder="%" aria-label="Override threshold %" style="width:80px;border:1px solid var(--border);border-radius:5px;padding:5px 7px;font-size:12px;">
        <button class="kpi-btn" data-action="add-override">Add override</button>
      </div>
      <div class="kpi-chips">${ovr}</div>`;
  }

  function renderForecast() {
    const rows = state.forecast;
    const table = rows.length ? `
      <div style="overflow-x:auto;"><table class="kpi-table"><thead><tr><th>ID</th><th>Role</th><th>JRS / Band</th><th>Skills</th><th>Start → End</th><th>Hrs/wk</th><th>Prob.</th><th></th></tr></thead><tbody>
      ${rows.map(r => `<tr><td>${esc(r.id)}</td><td><strong>${esc(r.roleTitle)}</strong><div class="kpi-note">${esc(r.client)}</div></td><td>${esc(r.jrs)}<div class="kpi-note">Band ${esc(r.bandMin)}–${esc(r.bandMax)}</div></td><td>${esc((r.skills || []).join(", "))}</td><td>${esc(r.startDate)} → ${esc(r.endDate || "open")}</td><td>${esc(r.hoursPerWeek)}</td><td>${esc(r.probability)}%</td><td><button class="kpi-btn kpi-sm kpi-danger" data-action="del-forecast" data-id="${esc(r.id)}">Remove</button></td></tr>`).join("")}
      </tbody></table></div>` : `<div class="kpi-empty">No forecast demand loaded. Upload a file or add a row below — open roles from the Demand tab are always included.</div>`;
    return `
      <div class="kpi-note">Forecast rows describe expected future demand. They are combined with the Open Roles already in the app, weighted by probability.</div>
      <div class="kpi-row">
        <input type="file" id="kpi-file-forecast" accept=".csv,.xlsx" aria-label="Upload demand forecast" data-file="forecast" style="font-size:12px;">
        <button class="kpi-btn" data-action="template-forecast">Download CSV template</button>
        <button class="kpi-btn kpi-danger" data-action="clear-forecast">Clear all</button>
      </div>
      <div class="kpi-note">Columns: id, roleTitle, client, jrs, skills, niceToHaveSkills, bandMin, bandMax, startDate, endDate, hoursPerWeek, probability, location, travelRequired, notes. Upload <strong>replaces</strong> the current forecast; invalid rows are skipped and reported.</div>
      ${msgBlock("forecast")}
      ${table}
      <div class="kpi-box-title" style="margin-top:12px;">Add a forecast row</div>
      <div class="kpi-form f5">
        ${["roleTitle:Role title:text", "jrs:JRS:text", "skills:Skills (comma-separated):text", "startDate:Start:date", "endDate:End (optional):date", "hoursPerWeek:Hours/wk:number", "probability:Probability %:number", "bandMin:Band min:number", "bandMax:Band max:number", "client:Client:text"]
          .map(s => { const [k, l, t] = s.split(":"); return `<div class="kpi-field"><label for="kpi-fc-${k}">${esc(l)}</label><input id="kpi-fc-${k}" data-fc="${k}" type="${t}"></div>`; }).join("")}
      </div>
      <button class="kpi-btn kpi-primary" data-action="add-forecast">Add row</button>`;
  }

  function renderEvents() {
    const consultants = deps.getConsultants();
    const rows = [...state.events].sort((a, b) => a.date.localeCompare(b.date));
    const table = rows.length ? `
      <table class="kpi-table"><thead><tr><th>Date</th><th>Type</th><th>Description</th><th>Consultant</th><th>Δ hrs/wk</th><th></th></tr></thead><tbody>
      ${rows.map(e => { const c = consultants.find(x => x.id === e.consultantId); return `<tr><td>${esc(e.date)}${e.endDate ? " → " + esc(e.endDate) : ""}</td><td>${esc(TYPE_LABEL[e.type] || e.type)}</td><td>${esc(e.label)}</td><td>${esc(c ? c.name : e.consultantId || "All")}</td><td>${e.hoursDelta ? esc((e.hoursDelta > 0 ? "+" : "") + e.hoursDelta) : "—"}</td><td><button class="kpi-btn kpi-sm kpi-danger" data-action="del-event" data-id="${esc(e.id)}">Remove</button></td></tr>`; }).join("")}
      </tbody></table>` : `<div class="kpi-empty">No known future events. Roll-off dates are still derived from each consultant's allocations.</div>`;
    return `
      ${timelineStrip({ startMs: parseDate(fw.asOf), days: state.config.horizonDays, events: rows, today: fw.asOf })}
      <div class="kpi-note">Holidays reduce billable capacity that week (days ÷ 5). Contract transitions change a named consultant's hours from the event date. Project-end events with a consultant and negative Δ hours remove load. Allocation end dates already on the roster are picked up automatically.</div>
      <div class="kpi-row">
        <input type="file" id="kpi-file-events" accept=".csv,.xlsx" aria-label="Upload future events" data-file="events" style="font-size:12px;">
        <button class="kpi-btn" data-action="template-events">Download CSV template</button>
        <button class="kpi-btn kpi-danger" data-action="clear-events">Clear all</button>
      </div>
      <div class="kpi-note">Columns: id, type (holiday | project_end | contract_transition), date, endDate, label, consultantId, hoursDelta.</div>
      ${msgBlock("events")}
      ${table}
      <div class="kpi-box-title" style="margin-top:12px;">Add an event</div>
      <div class="kpi-form f5">
        <div class="kpi-field"><label for="kpi-ev-type">Type</label><select id="kpi-ev-type" data-ev="type">${EVENT_TYPES.map(t => `<option value="${t}">${TYPE_LABEL[t]}</option>`).join("")}</select></div>
        <div class="kpi-field"><label for="kpi-ev-date">Date</label><input id="kpi-ev-date" data-ev="date" type="date"></div>
        <div class="kpi-field"><label for="kpi-ev-endDate">End date (optional)</label><input id="kpi-ev-endDate" data-ev="endDate" type="date"></div>
        <div class="kpi-field"><label for="kpi-ev-label">Description</label><input id="kpi-ev-label" data-ev="label" type="text"></div>
        <div class="kpi-field"><label for="kpi-ev-consultantId">Consultant</label><select id="kpi-ev-consultantId" data-ev="consultantId"><option value="">All / none</option>${consultants.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("")}</select></div>
        <div class="kpi-field"><label for="kpi-ev-hoursDelta">Δ hours/wk</label><input id="kpi-ev-hoursDelta" data-ev="hoursDelta" type="number" placeholder="e.g. -20 or 40"></div>
      </div>
      <button class="kpi-btn kpi-primary" data-action="add-event">Add event</button>`;
  }

  function renderRisks() {
    if (!fw.risks.length) return `<div class="kpi-empty">No bench risks: every consultant is projected at or above their threshold through ${esc(fw.horizonEnd)}.</div>`;
    return `<div style="overflow-x:auto;"><table class="kpi-table"><thead><tr><th>Consultant</th><th>Type</th><th>Severity</th><th>Utilization</th><th>Risk date</th><th>Free hrs/wk</th><th>Demand fit</th></tr></thead><tbody>
      ${fw.risks.map(r => {
        const best = r.matches.find(m => m.qualifies);
        const open = ui.expanded.has(r.id);
        const row = `<tr class="kpi-clickable" data-action="toggle-risk" data-id="${esc(r.id)}">
          <td><strong>${esc(r.name)}</strong><div class="kpi-note">${esc(r.skillProfile.jrs)} · Band ${esc(r.skillProfile.band)}</div></td>
          <td>${r.riskType === "current" ? '<span class="badge badge-red">Current</span>' : '<span class="badge badge-yellow">Projected</span>'}</td>
          <td>${sevBadge(r.severity)}</td>
          <td>${esc(r.currentPct)}% → <strong>${esc(r.riskPct)}%</strong><div class="kpi-note">threshold ${esc(r.thresholdPct)}%</div></td>
          <td>${esc(r.riskDate)}<div class="kpi-note">${r.daysUntilRisk <= 0 ? "now" : "in " + r.daysUntilRisk + "d"}</div></td>
          <td>${esc(r.freeHoursAtRisk)}h</td>
          <td>${best ? `<span class="badge badge-green">Match: ${esc(best.title)} (${esc(best.score)})</span>` : '<span class="badge badge-gray">No qualifying match</span>'}</td></tr>`;
        if (!open) return row;
        const sp = r.skillProfile;
        const detail = `<tr><td colspan="7" class="kpi-detail">
          <h4>Why flagged</h4><div class="kpi-why">${esc(r.reason)}</div>
          <h4>Utilization timeline</h4>
          <table class="kpi-table"><thead><tr><th>Date</th><th>Hours/wk</th><th>Utilization</th><th>Cause</th></tr></thead><tbody>${r.timeline.map(p => `<tr><td>${esc(p.date)}</td><td>${esc(p.hours)}</td><td>${esc(p.pct)}%</td><td>${esc(p.causes.join("; ") || (p.date === fw.asOf ? "today" : ""))}</td></tr>`).join("")}</tbody></table>
          <h4>Captured skill profile (used for matching)</h4>
          <div class="kpi-chips">${sp.skills.map(s => `<span>${esc(s)}</span>`).join("")}</div>
          <div class="kpi-note">JRS ${esc(sp.jrs)} · Band ${esc(sp.band)} · ${esc(sp.location)} · Travel ${sp.travelWillingness ? "yes" : "no"} · Industries: ${esc(sp.industries.join(", ") || "—")} · Certs: ${esc(sp.certifications.join(", ") || "—")} · Available from ${esc(sp.availableFrom)}</div>
          <h4>90-day demand matches (rule: score ≥ ${esc(state.config.minMatchScore)}, skill coverage ≥ ${esc(state.config.minSkillCoverage)}%, free hrs ≥ ½ of required)</h4>
          ${r.matches.length ? `<table class="kpi-table"><thead><tr><th>Demand</th><th>Source</th><th>Start</th><th>Score</th><th>Skills</th><th>Prob.</th><th>Result</th></tr></thead><tbody>${r.matches.slice(0, 6).map(m => `<tr><td>${esc(m.title)}<div class="kpi-note">${esc(m.client)}</div></td><td>${m.source === "forecast" ? "Forecast" : "Open role"}</td><td>${esc(m.startDate)}</td><td>${esc(m.score)}</td><td class="kpi-chips">${m.matchedSkills.map(s => `<span class="hit">${esc(s)}</span>`).join("")}${m.missingSkills.map(s => `<span class="miss">${esc(s)}</span>`).join("")}<div class="kpi-note">${esc(m.coverage)}% coverage</div></td><td>${esc(m.probability)}%</td><td>${m.qualifies ? '<span class="badge badge-green">Qualifies</span>' : `<span class="badge badge-gray">${esc(m.why.join("; "))}</span>`}</td></tr>`).join("")}</tbody></table>` : '<div class="kpi-note">No demand falls inside the horizon.</div>'}
        </td></tr>`;
        return row + detail;
      }).join("")}
      </tbody></table></div>`;
  }

  function renderLayer1() {
    const items = fw.demand.items;
    const weighted = Math.round(items.reduce((s, d) => s + d.hoursPerWeek * d.probability / 100, 0));
    const atRisk = Math.round(fw.risks.reduce((s, r) => s + r.freeHoursAtRisk, 0));
    const roster = fw.records;
    const bases = roster.reduce((m, r) => { m[r.billable.basis] = (m[r.billable.basis] || 0) + 1; return m; }, {});
    return `
    <div class="kpi-layer">
      <div class="kpi-layer-head"><span class="kpi-layer-tag l1">Layer 1</span><span class="kpi-layer-title">Input KPIs &amp; Triggers</span><span class="kpi-layer-sub">Detect current and near-future staffing risk (${esc(fw.asOf)} → ${esc(fw.horizonEnd)})</span></div>
      <div class="kpi-layer-body">
        <div class="kpi-tiles" style="grid-template-columns:repeat(4,1fr);">
          <div class="kpi-tile"><div class="kpi-tile-label">Current utilization data</div><div class="kpi-tile-value">${roster.length}</div><div class="kpi-tile-sub">consultants from the roster</div><div class="kpi-tile-formula">Billable basis: ${Object.entries(bases).map(([k, v]) => `${v} ${esc(BASIS_LABEL[k])}`).join(", ") || "—"}</div></div>
          <div class="kpi-tile"><div class="kpi-tile-label">Demand in horizon</div><div class="kpi-tile-value">${items.length}</div><div class="kpi-tile-sub">${items.filter(i => i.source === "forecast").length} forecast + ${items.filter(i => i.source === "open-role").length} open roles</div><div class="kpi-tile-formula">≈ ${weighted}h/wk probability-weighted</div></div>
          <div class="kpi-tile"><div class="kpi-tile-label">Known future events</div><div class="kpi-tile-value">${state.events.filter(e => { const t = parseDate(e.date); return t >= parseDate(fw.asOf) && t <= parseDate(fw.horizonEnd); }).length}</div><div class="kpi-tile-sub">inside the horizon</div><div class="kpi-tile-formula">${state.events.length} total on file</div></div>
          <div class="kpi-tile ${fw.risks.length ? "warn" : "good"}"><div class="kpi-tile-label">Capacity at risk</div><div class="kpi-tile-value">${atRisk}h</div><div class="kpi-tile-sub">per week across ${fw.risks.length} bench risk(s)</div><div class="kpi-tile-formula">Σ (capacity − projected hours) at each risk date</div></div>
        </div>
        ${fw.warnings.map(w => `<div class="kpi-msg warn">${esc(w)}</div>`).join("")}
        ${section("risks", "Bench risks flagged", fw.risks.length, renderRisks())}
        ${section("config", "Thresholds & targets", null, renderConfig())}
        ${section("forecast", "Demand forecast (90-day look-ahead)", state.forecast.length, renderForecast())}
        ${section("events", "Future events calendar", state.events.length, renderEvents())}
      </div>
    </div>`;
  }

  // ── Layer 2 ────────────────────────────────────────────────────────────────
  function renderTiles() {
    const k = fw.kpis, cg = k.chargeability, br = k.benchRisk, sm = k.skillMatch, ac = k.actions, fa = k.forecastAccuracy;
    const brTrend = br.delta === null ? "no prior snapshot" : `${br.delta > 0 ? "▲" : br.delta < 0 ? "▼" : "■"} ${Math.abs(br.delta)} vs ${br.previousDate}`;
    const brClass = br.total === 0 ? "good" : br.delta > 0 || br.high > 0 ? "bad" : "warn";
    return `<div class="kpi-tiles">
      <div class="kpi-tile ${cg.status === "na" ? "" : cg.status}"><div class="kpi-tile-label">Chargeability</div><div class="kpi-tile-value">${pct(cg.current)}</div><div class="kpi-tile-sub">target ${cg.target}% · ${cg.gap === null ? "—" : (cg.gap >= 0 ? "+" : "") + cg.gap + " pts"}</div><div class="kpi-tile-formula">${esc(cg.formula)}</div></div>
      <div class="kpi-tile ${brClass}"><div class="kpi-tile-label">Bench risks</div><div class="kpi-tile-value">${br.total}</div><div class="kpi-tile-sub">${br.current} current · ${br.projected} projected · ${br.high} high</div><div class="kpi-tile-formula">Trend: ${esc(brTrend)}</div></div>
      <div class="kpi-tile ${sm.rate === null ? "" : sm.rate >= 75 ? "good" : sm.rate >= 50 ? "warn" : "bad"}"><div class="kpi-tile-label">Skill-match success</div><div class="kpi-tile-value">${pct(sm.rate)}</div><div class="kpi-tile-sub">${sm.matched} of ${sm.total} risks matched to demand</div><div class="kpi-tile-formula">${esc(sm.formula)}</div></div>
      <div class="kpi-tile ${ac.open ? "warn" : "good"}"><div class="kpi-tile-label">Recommended actions</div><div class="kpi-tile-value">${ac.open}</div><div class="kpi-tile-sub">pending · ${ac.completed} completed · ${ac.dismissed} dismissed</div><div class="kpi-tile-formula">Completion rate ${pct(ac.completionRate)} = completed ÷ (open + completed)</div></div>
      <div class="kpi-tile ${fa.count === 0 ? "" : fa.chargeabilityAccuracy >= 95 ? "good" : fa.chargeabilityAccuracy >= 90 ? "warn" : "bad"}"><div class="kpi-tile-label">Forecast accuracy</div><div class="kpi-tile-value">${pct(fa.chargeabilityAccuracy)}</div><div class="kpi-tile-sub">${fa.count ? `risk-list agreement ${fa.riskAgreement}% · ${fa.count} comparison(s)` : "needs a prior 30-day prediction"}</div><div class="kpi-tile-formula">100 − mean |predicted − actual| chargeability${fa.meanErrorPts !== null ? ` (${fa.meanErrorPts} pts)` : ""}</div></div>
    </div>`;
  }

  function renderCharts() {
    const hist = [...state.history].filter(s => s.date <= fw.asOf).sort((a, b) => a.date.localeCompare(b.date)).slice(-16);
    const histNoToday = hist.filter(s => s.date !== fw.asOf);
    const proj = fw.baseline, withR = fw.withRecs;
    const labels = [...histNoToday.map(s => s.date.slice(5)), ...proj.map(p => p.date.slice(5))];
    const nh = histNoToday.length;
    const pad = n => Array(n).fill(null);
    const actual = [...histNoToday.map(s => s.chargeability), proj[0].pct, ...pad(proj.length - 1)];
    const base = [...pad(nh), ...proj.map(p => p.pct)];
    const rec = [...pad(nh), ...withR.map(p => p.pct)];
    const chargeChart = lineChart({
      title: "Chargeability trend and 90-day projection", labels,
      series: [{ label: "Actual", color: "#0f62fe", values: actual }, { label: "Projected (no action)", color: "#b45309", values: base, dash: true }, { label: "Projected (if allocate actions accepted)", color: "#198038", values: rec, dash: true }],
      target: state.config.practiceTargetPct, targetLabel: "Target",
    });
    const bl = hist.map(s => s.date.slice(5));
    const riskChart = stackedBarChart({
      title: "Bench risk count by snapshot", labels: bl,
      stacks: [{ label: "Current", color: "#a2191f", values: hist.map(s => s.benchRiskCurrent) }, { label: "Projected", color: "#b45309", values: hist.map(s => s.benchRiskProjected) }],
      emptyText: "No snapshots yet.",
    });
    const smChart = lineChart({
      title: "Skill-match success rate", labels: bl,
      series: [{ label: "Skill-match %", color: "#6929c4", values: hist.map(s => s.skillMatchRate) }],
      emptyText: "No snapshots yet.",
    });
    const fa = fw.accuracy;
    const faChart = lineChart({
      title: "Forecast vs actual chargeability", labels: fa.results.map(r => r.targetDate.slice(5)),
      series: [{ label: "Predicted", color: "#b45309", values: fa.results.map(r => r.predictedPct), dash: true }, { label: "Actual", color: "#0f62fe", values: fa.results.map(r => r.actualPct) }],
      emptyText: "Accuracy appears once a prediction made ~30 days ago can be compared with today's snapshot.",
    });
    return `<div class="kpi-grid2">
      <div class="kpi-box"><div class="kpi-box-title">Chargeability — actual, 90-day projection &amp; target</div>${chargeChart}</div>
      <div class="kpi-box"><div class="kpi-box-title">Bench risk trend</div>${riskChart}</div>
      <div class="kpi-box"><div class="kpi-box-title">Skill-match success trend</div>${smChart}</div>
      <div class="kpi-box"><div class="kpi-box-title">Forecast accuracy — predicted vs actual</div>${faChart}</div>
    </div>`;
  }

  function renderRecs() {
    const all = fw.recommendations;
    const shown = all.filter(r => ui.recFilter === "all" ? true : ui.recFilter === "open" ? (r.status === "pending" || r.status === "accepted") : r.status === ui.recFilter);
    const counts = s => all.filter(r => r.status === s).length;
    const filt = (v, l) => `<button class="kpi-btn kpi-sm ${ui.recFilter === v ? "kpi-primary" : "kpi-ghost"}" data-action="rec-filter" data-id="${v}">${l}</button>`;
    const body = shown.length ? shown.map(r => {
      const dem = r.demandId ? fw.demand.items.find(d => d.id === r.demandId) : null;
      return `<div class="kpi-rec ${esc(r.priority)} ${r.status === "dismissed" ? "dismissed" : ""}">
        <div class="kpi-rec-top"><span class="kpi-rec-title">${esc(r.title)}</span><span class="badge badge-blue">${esc(REC_LABEL[r.type])}</span>${sevBadge(r.priority)}<span class="badge ${r.status === "completed" ? "badge-green" : r.status === "accepted" ? "badge-purple" : r.status === "dismissed" ? "badge-gray" : "badge-yellow"}">${esc(r.status)}</span></div>
        <div class="kpi-rec-detail">${esc(r.detail)}</div>
        <ul>${r.evidence.map(e => `<li>${esc(e)}</li>`).join("")}</ul>
        <div class="kpi-rec-actions">
          ${r.status === "pending" ? `<button class="kpi-btn kpi-sm kpi-primary" data-action="rec-set" data-id="${esc(r.id)}" data-status="accepted">Accept</button>` : ""}
          ${r.status === "pending" || r.status === "accepted" ? `<button class="kpi-btn kpi-sm" data-action="rec-set" data-id="${esc(r.id)}" data-status="completed">Mark completed</button><button class="kpi-btn kpi-sm kpi-ghost" data-action="rec-set" data-id="${esc(r.id)}" data-status="dismissed">Dismiss</button>` : `<button class="kpi-btn kpi-sm kpi-ghost" data-action="rec-set" data-id="${esc(r.id)}" data-status="pending">Reopen</button>`}
          ${dem && dem.source === "open-role" ? `<button class="kpi-btn kpi-sm kpi-ghost" data-action="view-role" data-id="${esc(dem.id)}">View role →</button>` : ""}
        </div></div>`;
    }).join("") : `<div class="kpi-empty">No recommendations in this view.</div>`;
    return `<div class="kpi-row">${filt("open", `Pending (${counts("pending") + counts("accepted")})`)}${filt("completed", `Completed (${counts("completed")})`)}${filt("dismissed", `Dismissed (${counts("dismissed")})`)}${filt("all", "All")}</div>${body}`;
  }

  function renderExplain() {
    const c = state.config;
    return `<div class="kpi-why">
      <p><strong>Bench risk rule:</strong> flagged when utilization &lt; the consultant's threshold (default ${c.consultantThresholdPct}%) today, or when it is projected to fall below it on any allocation end date or contract-transition date inside the ${c.horizonDays}-day horizon. Utilization comes from the existing calculation (weekly-hours sheet → allocations → static % → status heuristic).</p>
      <p><strong>Projection:</strong> each allocation whose end date has passed by the projection date is removed; contract-transition events add or remove the stated hours. Allocations that already ended before the as-of date are ignored. Severity: gap ≥ 40 pts = high, ≥ 20 = medium, else low.</p>
      <p><strong>Chargeability:</strong> Σ billable hours ÷ Σ capacity hours. Billable = weekly-hours-sheet billable average; otherwise allocations whose client is not "Internal"; otherwise allocated hours (marked estimated). Holiday weekdays in a week scale that week's billable hours by (1 − days/5).</p>
      <p><strong>Matching:</strong> each bench risk is scored against every open role and forecast item in the horizon using the existing 7-dimension candidate scorer, with availability set to the date the consultant frees up. A match qualifies when score ≥ ${c.minMatchScore}, required-skill coverage ≥ ${c.minSkillCoverage}%, and free hours ≥ ½ of the hours required.</p>
      <p><strong>Recommendation order:</strong> (1) allocate to the best qualifying demand; (2) else rebalance hours from an over-allocated peer if the profile score ≥ ${c.minMatchScore}; (3) else develop / redeploy, listing the most-requested missing skills.</p>
      <p><strong>Forecast accuracy:</strong> each daily snapshot stores a 30-day chargeability and bench-risk prediction. When a later snapshot lands within 3 days of the target date, accuracy = 100 − |predicted − actual|; risk agreement = overlap ÷ union of predicted vs actual below-threshold consultants.</p>
    </div>`;
  }

  function renderLayer2() {
    return `
    <div class="kpi-layer">
      <div class="kpi-layer-head"><span class="kpi-layer-tag">Layer 2</span><span class="kpi-layer-title">Optimizer KPIs &amp; Metrics</span><span class="kpi-layer-sub">How well the optimizer is working and how healthy allocation is</span></div>
      <div class="kpi-layer-body">
        ${renderTiles()}
        ${renderCharts()}
        ${section("recs", "Recommended actions", fw.recommendations.filter(r => r.status === "pending" || r.status === "accepted").length, renderRecs())}
        ${section("explain", "How these numbers are calculated", null, renderExplain())}
      </div>
    </div>`;
  }

  function render() {
    compute();
    const scrollY = window.scrollY;
    container.innerHTML = `
      <div class="kpi-wrap">
        <div class="kpi-head">
          <h2>KPI Framework</h2>
          ${isDemo() ? '<span class="kpi-demo" title="Sample forecast, events and history are loaded so the 90-day look-ahead can be demonstrated">Sample inputs · as of ' + esc(DEMO_AS_OF) + '</span>' : ""}
          <span class="kpi-spacer"></span>
          <button class="kpi-btn" data-action="export-xlsx">Export KPIs (Excel)</button>
          <button class="kpi-btn" data-action="export-json">Export settings &amp; history (JSON)</button>
          <button class="kpi-btn"><label style="cursor:pointer;">Import JSON<input type="file" accept=".json" data-file="bundle" style="display:none;"></label></button>
          <button class="kpi-btn kpi-danger" data-action="reset-kpi">Reset KPI data</button>
        </div>
        ${msgBlock("global")}
        ${renderLayer1()}
        ${renderLayer2()}
      </div>`;
    window.scrollTo(window.scrollX, scrollY);
  }

  // ── Actions ────────────────────────────────────────────────────────────────
  const setMsg = (key, kind, text, items) => { ui.msgs[key] = { kind, text, items }; };
  const download = (name, text, type) => {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const csvCell = v => { const s = Array.isArray(v) ? v.join(",") : String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const toCsv = (cols, rows) => [cols.join(","), ...rows.map(r => cols.map(c => csvCell(r[c])).join(","))].join("\n");

  async function readRows(file) {
    const buf = await file.arrayBuffer();
    const wb = deps.XLSX.read(buf, { type: "array", cellDates: false });
    if (!wb.SheetNames.length) throw new Error("The file has no sheets.");
    return deps.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
  }

  async function onFile(input) {
    const file = input.files && input.files[0];
    const kind = input.dataset.file;
    input.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setMsg(kind === "bundle" ? "global" : kind, "error", "File is larger than 5 MB."); render(); return; }
    try {
      if (kind === "bundle") {
        const res = store.importBundle(await file.text(), new Set(deps.getConsultants().map(c => c.id)));
        if (!res.ok) { setMsg("global", "error", "Import failed.", res.errors); render(); return; }
        state = { ...res.state, config: res.state.config };
        persistAll();
        setMsg("global", res.errors.length ? "warn" : "ok", `Imported settings, ${state.forecast.length} forecast row(s), ${state.events.length} event(s), ${state.history.length} snapshot(s).`, res.errors);
      } else {
        if (!/\.(csv|xlsx)$/i.test(file.name)) throw new Error("Please choose a .csv or .xlsx file.");
        const rows = await readRows(file);
        if (!rows.length) throw new Error("The file has no data rows.");
        const res = kind === "forecast" ? validateForecastRows(rows) : validateEventRows(rows, new Set(deps.getConsultants().map(c => c.id)));
        const errs = res.errors.map(e => `Line ${e.line}: ${e.message}`);
        if (!res.valid.length) { setMsg(kind, "error", "No valid rows found — nothing was imported.", errs); }
        else {
          if (kind === "forecast") { state.forecast = res.valid; store.saveForecast(state.forecast); } else { state.events = res.valid; store.saveEvents(state.events); }
          setMsg(kind, errs.length ? "warn" : "ok", `Imported ${res.valid.length} row(s)${errs.length ? `; skipped ${errs.length} invalid row(s):` : "."}`, errs);
        }
      }
    } catch (e) { setMsg(kind === "bundle" ? "global" : kind, "error", e && e.message ? e.message : "Could not read the file."); }
    render();
  }

  function exportXlsx() {
    const X = deps.XLSX, wb = X.utils.book_new();
    const k = fw.kpis;
    const summary = [
      { KPI: "As-of date", Value: fw.asOf, Basis: `Horizon ends ${fw.horizonEnd}` },
      { KPI: "Chargeability %", Value: k.chargeability.current ?? "", Basis: k.chargeability.formula },
      { KPI: "Chargeability target %", Value: k.chargeability.target, Basis: "Configured" },
      { KPI: "Bench risks (total)", Value: k.benchRisk.total, Basis: `${k.benchRisk.current} current, ${k.benchRisk.projected} projected` },
      { KPI: "Skill-match success %", Value: k.skillMatch.rate ?? "", Basis: k.skillMatch.formula },
      { KPI: "Actions pending", Value: k.actions.open, Basis: `${k.actions.completed} completed, ${k.actions.dismissed} dismissed` },
      { KPI: "Forecast accuracy %", Value: k.forecastAccuracy.chargeabilityAccuracy ?? "", Basis: `${k.forecastAccuracy.count} comparison(s)` },
    ];
    X.utils.book_append_sheet(wb, X.utils.json_to_sheet(summary), "KPI Summary");
    X.utils.book_append_sheet(wb, X.utils.json_to_sheet(fw.risks.map(r => ({
      Consultant: r.name, ID: r.consultantId, Type: r.riskType, Severity: r.severity, "Current %": r.currentPct, "Risk %": r.riskPct, Threshold: r.thresholdPct,
      "Risk Date": r.riskDate, "Free Hrs/Wk": r.freeHoursAtRisk, Skills: r.skillProfile.skills.join(", "), JRS: r.skillProfile.jrs, Reason: r.reason,
      "Best Match": (r.matches.find(m => m.qualifies) || {}).title || "",
    }))), "Bench Risks");
    X.utils.book_append_sheet(wb, X.utils.json_to_sheet(fw.recommendations.map(r => ({ Type: r.type, Priority: r.priority, Status: r.status, Consultant: r.name, Action: r.title, Detail: r.detail, Evidence: r.evidence.join(" | ") }))), "Recommendations");
    X.utils.book_append_sheet(wb, X.utils.json_to_sheet(state.history.map(s => ({ Date: s.date, "Chargeability %": s.chargeability, "Target %": s.target, "Bench Risks": s.benchRiskTotal, "Skill Match %": s.skillMatchRate ?? "", "Recs Open": s.recsOpen, "Recs Completed": s.recsCompleted, "Predicted 30d %": s.predicted ? s.predicted.chargeability : "", Sample: s.demo ? "Yes" : "No" }))), "KPI History");
    X.writeFile(wb, `KPI_Report_${fw.asOf}.xlsx`);
  }

  function addForecast() {
    const raw = {};
    container.querySelectorAll("[data-fc]").forEach(el => { raw[el.dataset.fc] = el.value; });
    raw.id = `F-${String(Date.now()).slice(-6)}`;
    const res = validateForecastRows([raw]);
    if (res.errors.length) { setMsg("forecast", "error", "Row not added:", res.errors.map(e => e.message)); return; }
    state.forecast = [...state.forecast, res.valid[0]]; store.saveForecast(state.forecast);
    setMsg("forecast", "ok", `Added "${res.valid[0].roleTitle}".`);
  }
  function addEvent() {
    const raw = {};
    container.querySelectorAll("[data-ev]").forEach(el => { raw[el.dataset.ev] = el.value; });
    raw.id = `E-${String(Date.now()).slice(-6)}`;
    const res = validateEventRows([raw], new Set(deps.getConsultants().map(c => c.id)));
    if (res.errors.length) { setMsg("events", "error", "Event not added:", res.errors.map(e => e.message)); return; }
    state.events = [...state.events, res.valid[0]]; store.saveEvents(state.events);
    setMsg("events", "ok", `Added "${res.valid[0].label}".`);
  }
  function saveConfig() {
    const raw = { overrides: state.config.overrides };
    container.querySelectorAll("[data-cfg]").forEach(el => { raw[el.dataset.cfg] = el.value; });
    const res = validateConfig(raw);
    if (!res.ok) { setMsg("config", "error", "Thresholds not saved:", res.errors); return; }
    state.config = res.config; store.saveConfig(state.config);
    setMsg("config", "ok", "Thresholds saved. All KPIs recalculated.");
  }
  function addOverride() {
    const id = container.querySelector("#kpi-ovr-id").value, v = container.querySelector("#kpi-ovr-val").value;
    const res = validateConfig({ ...state.config, overrides: { ...state.config.overrides, [id]: v } });
    if (!res.ok) { setMsg("config", "error", "Override not added:", res.errors); return; }
    state.config = res.config; store.saveConfig(state.config);
    setMsg("config", "ok", "Override saved.");
  }

  function onClick(e) {
    const t = e.target.closest("[data-action]");
    if (!t || !container.contains(t)) return;
    const a = t.dataset.action, id = t.dataset.id;
    if (t.tagName === "A") e.preventDefault();
    switch (a) {
      case "toggle-sec": ui.open.has(id) ? ui.open.delete(id) : ui.open.add(id); break;
      case "toggle-risk": ui.expanded.has(id) ? ui.expanded.delete(id) : ui.expanded.add(id); break;
      case "rec-filter": ui.recFilter = id; break;
      case "rec-set": {
        state.recStates = { ...state.recStates, [id]: { status: t.dataset.status, updatedOn: todayISO() } };
        if (t.dataset.status === "pending") delete state.recStates[id];
        store.saveRecStates(state.recStates); break;
      }
      case "view-role": deps.viewRole(id); return;
      case "save-config": saveConfig(); break;
      case "config-defaults": state.config = { ...DEFAULT_CONFIG, asOfDate: state.config.asOfDate, overrides: {} }; store.saveConfig(state.config); setMsg("config", "ok", "Defaults restored."); break;
      case "config-today": state.config = { ...state.config, asOfDate: "" }; store.saveConfig(state.config); setMsg("config", "ok", "Now using today's date. Sample forecast dates were built around " + DEMO_AS_OF + "; adjust or clear them for live use."); break;
      case "add-override": addOverride(); break;
      case "del-override": { const o = { ...state.config.overrides }; delete o[id]; state.config = { ...state.config, overrides: o }; store.saveConfig(state.config); break; }
      case "add-forecast": addForecast(); break;
      case "del-forecast": state.forecast = state.forecast.filter(r => r.id !== id); store.saveForecast(state.forecast); break;
      case "clear-forecast": if (!confirm("Remove all demand forecast rows?")) return; state.forecast = []; store.saveForecast([]); setMsg("forecast", "ok", "Forecast cleared."); break;
      case "add-event": addEvent(); break;
      case "del-event": state.events = state.events.filter(r => r.id !== id); store.saveEvents(state.events); break;
      case "clear-events": if (!confirm("Remove all future events?")) return; state.events = []; store.saveEvents([]); setMsg("events", "ok", "Events cleared."); break;
      case "template-forecast": download("demand_forecast_template.csv", toCsv(["id", "roleTitle", "client", "jrs", "skills", "niceToHaveSkills", "bandMin", "bandMax", "startDate", "endDate", "hoursPerWeek", "probability", "location", "travelRequired", "notes"], state.forecast.length ? state.forecast : sampleForecast()), "text/csv"); return;
      case "template-events": download("future_events_template.csv", toCsv(["id", "type", "date", "endDate", "label", "consultantId", "hoursDelta"], state.events.length ? state.events : sampleEvents()), "text/csv"); return;
      case "export-json": download(`kpi_settings_history_${fw.asOf}.json`, store.exportBundle({ config: state.config, forecast: state.forecast, events: state.events, history: state.history, recStates: state.recStates }), "application/json"); return;
      case "export-xlsx": exportXlsx(); return;
      case "reset-kpi":
        if (!confirm("Reset KPI thresholds, forecast, events, history and action status to the sample inputs?")) return;
        store.clearAll(); state = null; ui.msgs = {}; bootstrap(); setMsg("global", "ok", "KPI data reset to sample inputs."); break;
      default: return;
    }
    render();
  }

  container.addEventListener("click", onClick);
  container.addEventListener("change", e => { if (e.target.matches && e.target.matches("input[type=file][data-file]")) onFile(e.target); });

  bootstrap();
  return { render, getFramework: () => fw };
}
