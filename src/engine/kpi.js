/**
 * KPI Engine — deterministic, rule-based, no ML/LLM, no DOM, no storage.
 *
 * Layer 1 (inputs & triggers): thresholds, forecast, events -> bench-risk flags + skill profiles.
 * Layer 2 (optimizer KPIs): chargeability, bench-risk trend, skill-match rate, action
 * status, forecast accuracy.
 *
 * It never re-implements utilization or candidate scoring. Both are injected:
 *   calcUtilization(consultant) -> { allocatedHours, capacityHours, pct, status, freeHours,
 *                                    allocations, weeklyHoursData, inferred }
 *   scoreConsultant(consultant, role) -> { overallScore, dimensions, ... }
 * so the existing functions stay independent and this module is testable with stubs.
 *
 * Every number returned carries the inputs/rule that produced it (see `reason`,
 * `evidence`, `formula` fields) so the UI can explain it.
 */

export const DAY_MS = 86400000;
export const EVENT_TYPES = ["holiday", "project_end", "contract_transition"];

export const DEFAULT_CONFIG = Object.freeze({
  asOfDate: "",                // "" = use today's date
  horizonDays: 90,
  consultantThresholdPct: 70,  // below this => bench risk (matches the app's "fully utilized" floor)
  practiceTargetPct: 75,       // chargeability target
  minMatchScore: 50,           // same viability cut-off the app uses for "good candidate"
  minSkillCoverage: 50,        // % of a demand's required skills the consultant must hold
  unsignedRoleProbability: 50, // probability assigned to open roles without a signed contract
  overrides: {},               // consultantId -> threshold %
});

const CONFIG_RULES = {
  horizonDays:             { min: 14, max: 180, int: true, label: "Forecast horizon (days)" },
  consultantThresholdPct:  { min: 1,  max: 100, label: "Consultant utilization threshold (%)" },
  practiceTargetPct:       { min: 1,  max: 100, label: "Practice chargeability target (%)" },
  minMatchScore:           { min: 0,  max: 100, label: "Minimum match score" },
  minSkillCoverage:        { min: 0,  max: 100, label: "Minimum skill coverage (%)" },
  unsignedRoleProbability: { min: 0,  max: 100, label: "Unsigned-role probability (%)" },
};

// ─── Date / number helpers ───────────────────────────────────────────────────

/** Strict YYYY-MM-DD -> UTC ms, NaN when invalid (e.g. 2026-02-31). */
export function parseDate(s) {
  if (typeof s !== "string") return NaN;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return NaN;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(t);
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return NaN;
  return t;
}
export const toISO = ms => new Date(ms).toISOString().slice(0, 10);
export function addDays(iso, n) { return toISO(parseDate(iso) + n * DAY_MS); }
export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Accepts ISO, M/D/YYYY, Excel serials and Date objects. "" = blank, null = invalid. */
export function parseDateLoose(v) {
  if (v === undefined || v === null || v === "") return "";
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : toISO(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate()));
  if (typeof v === "number") {
    if (!Number.isFinite(v) || v < 20000 || v > 80000) return null;
    return toISO(Date.UTC(1899, 11, 30) + Math.round(v) * DAY_MS);
  }
  const s = String(v).trim();
  if (!s) return "";
  if (!Number.isNaN(parseDate(s))) return s;
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (us) {
    const iso = `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
    return Number.isNaN(parseDate(iso)) ? null : iso;
  }
  return null;
}

/** "70", "70%", 70 -> 70 ; blank -> null ; garbage -> NaN */
export function toNum(v) {
  if (v === undefined || v === null || String(v).trim() === "") return null;
  if (typeof v === "number") return v;
  return Number(String(v).replace("%", "").trim());
}

const round1 = n => Math.round(n * 10) / 10;
const normKey = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
const normSkill = s => String(s).toLowerCase().trim();
const isInternal = a => /internal/i.test(String((a && a.client) || ""));

function pick(raw, ...names) {
  const wanted = names.map(normKey);
  for (const k of Object.keys(raw || {})) if (wanted.includes(normKey(k))) return raw[k];
  return undefined;
}
function listOf(v) {
  if (Array.isArray(v)) return v.map(x => String(x).trim()).filter(Boolean);
  if (v === undefined || v === null) return [];
  return String(v).split(/[,;|]/).map(s => s.trim()).filter(Boolean);
}
function boolOf(v) {
  if (typeof v === "boolean") return v;
  return ["true", "yes", "1", "y"].includes(String(v ?? "").toLowerCase().trim());
}

// ─── Layer 1: configuration & input validation ───────────────────────────────

/** Returns { ok, config, errors }. Invalid fields fall back to defaults and are reported. */
export function validateConfig(input) {
  const src = input || {};
  const errors = [];
  const config = { ...DEFAULT_CONFIG, overrides: {} };
  for (const [key, rule] of Object.entries(CONFIG_RULES)) {
    const v = src[key];
    if (v === undefined || v === null || v === "") continue;
    const n = Number(v);
    if (!Number.isFinite(n) || n < rule.min || n > rule.max || (rule.int && !Number.isInteger(n))) {
      errors.push(`${rule.label} must be ${rule.int ? "a whole number" : "a number"} between ${rule.min} and ${rule.max}.`);
    } else config[key] = n;
  }
  if (src.asOfDate) {
    if (Number.isNaN(parseDate(String(src.asOfDate)))) errors.push("As-of date must be a valid date (YYYY-MM-DD).");
    else config.asOfDate = String(src.asOfDate).trim();
  }
  for (const [id, v] of Object.entries(src.overrides || {})) {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 1 || n > 100) errors.push(`Override for ${id} must be between 1 and 100.`);
    else config.overrides[id] = n;
  }
  return { ok: errors.length === 0, config, errors };
}

/** Validate/normalize demand-forecast rows (from CSV/XLSX or manual entry). */
export function validateForecastRows(rows) {
  const valid = [], errors = [], seen = new Set();
  (rows || []).forEach((raw, i) => {
    const line = i + 2; // header is line 1
    const errs = [];
    const id = String(pick(raw, "id") || `F-${String(line).padStart(3, "0")}`).trim();
    const start = parseDateLoose(pick(raw, "startDate", "start"));
    const end = parseDateLoose(pick(raw, "endDate", "end"));
    const roleTitle = String(pick(raw, "roleTitle", "role", "title") || "").trim();
    const jrs = String(pick(raw, "jrs") || "").trim();
    const skills = listOf(pick(raw, "skills", "requiredSkills"));
    const hours = toNum(pick(raw, "hoursPerWeek", "weeklyHours"));
    const prob = toNum(pick(raw, "probability", "prob"));
    const bandMin = toNum(pick(raw, "bandMin"));
    const bandMax = toNum(pick(raw, "bandMax"));

    if (!start) errs.push(start === null ? "startDate is not a valid date" : "startDate is required");
    if (end === null) errs.push("endDate is not a valid date");
    else if (end && start && end < start) errs.push("endDate is before startDate");
    if (!roleTitle) errs.push("roleTitle is required");
    if (!jrs) errs.push("jrs is required");
    if (skills.length === 0) errs.push("at least one skill is required");
    if (hours !== null && (!Number.isFinite(hours) || hours < 1 || hours > 80)) errs.push("hoursPerWeek must be 1–80");
    if (prob !== null && (!Number.isFinite(prob) || prob < 0 || prob > 100)) errs.push("probability must be 0–100");
    if (bandMin !== null && (!Number.isFinite(bandMin) || bandMin < 1 || bandMin > 20)) errs.push("bandMin must be 1–20");
    if (bandMax !== null && (!Number.isFinite(bandMax) || bandMax < 1 || bandMax > 20)) errs.push("bandMax must be 1–20");
    if (bandMin !== null && bandMax !== null && bandMin > bandMax) errs.push("bandMin is greater than bandMax");
    if (seen.has(id)) errs.push(`duplicate id ${id}`);

    if (errs.length) { errors.push({ line, message: errs.join("; ") }); return; }
    seen.add(id);
    valid.push({
      id, startDate: start, endDate: end || "", roleTitle,
      client: String(pick(raw, "client") || "").trim(), jrs, skills,
      niceToHaveSkills: listOf(pick(raw, "niceToHaveSkills")),
      hoursPerWeek: hours ?? 40, probability: prob ?? 100,
      bandMin: bandMin ?? 1, bandMax: bandMax ?? 99,
      location: String(pick(raw, "location") || "").trim(),
      travelRequired: boolOf(pick(raw, "travelRequired")),
      notes: String(pick(raw, "notes") || "").trim(),
    });
  });
  return { valid, errors };
}

/** Validate/normalize known-future-event rows. knownIds (Set) optionally checks consultantId. */
export function validateEventRows(rows, knownIds) {
  const valid = [], errors = [], seen = new Set();
  (rows || []).forEach((raw, i) => {
    const line = i + 2;
    const errs = [];
    const id = String(pick(raw, "id") || `E-${String(line).padStart(3, "0")}`).trim();
    const type = String(pick(raw, "type") || "").toLowerCase().trim().replace(/[\s-]+/g, "_");
    const date = parseDateLoose(pick(raw, "date", "startDate"));
    const end = parseDateLoose(pick(raw, "endDate"));
    const label = String(pick(raw, "label", "name", "description") || "").trim() || type;
    const consultantId = String(pick(raw, "consultantId", "consultant") || "").trim();
    const delta = toNum(pick(raw, "hoursDelta", "hours"));

    if (!EVENT_TYPES.includes(type)) errs.push(`type must be one of ${EVENT_TYPES.join(", ")}`);
    if (!date) errs.push(date === null ? "date is not a valid date" : "date is required");
    if (end === null) errs.push("endDate is not a valid date");
    else if (end && date && end < date) errs.push("endDate is before date");
    if (delta !== null && (!Number.isFinite(delta) || Math.abs(delta) > 80)) errs.push("hoursDelta must be a number between -80 and 80");
    if (consultantId && knownIds && !knownIds.has(consultantId)) errs.push(`consultantId ${consultantId} is not in the roster`);
    if (type === "contract_transition" && (!delta || !consultantId)) errs.push("contract_transition needs consultantId and a non-zero hoursDelta");
    if (type === "project_end" && consultantId && !(delta < 0)) errs.push("project_end with a consultantId needs a negative hoursDelta");
    if (type === "holiday" && consultantId) errs.push("holiday applies to everyone; leave consultantId blank");
    if (seen.has(id)) errs.push(`duplicate id ${id}`);

    if (errs.length) { errors.push({ line, message: errs.join("; ") }); return; }
    seen.add(id);
    valid.push({ id, type, date, endDate: end || "", label, consultantId, hoursDelta: delta ?? 0 });
  });
  return { valid, errors };
}

// ─── Per-consultant projection (Layer 1 core) ────────────────────────────────

/**
 * Billable hours/week used for chargeability. Basis is reported for transparency:
 *  weekly-hours : average billable from the Weekly Hours sheet
 *  allocations  : sum of non-"Internal" client allocations
 *  estimated    : no detail available; allocated hours treated as billable
 */
export function billableHours(util) {
  const cap = util.capacityHours || 0;
  let hours, basis;
  if (util.status === "bench") { hours = 0; basis = "allocations"; }
  else if (util.weeklyHoursData && Number.isFinite(Number(util.weeklyHoursData.avgBillable))) {
    hours = Number(util.weeklyHoursData.avgBillable); basis = "weekly-hours";
  } else if ((util.allocations || []).length > 0) {
    hours = util.allocations.filter(a => !isInternal(a)).reduce((s, a) => s + (Number(a.weeklyHours) || 0), 0);
    basis = "allocations";
  } else { hours = util.allocatedHours || 0; basis = "estimated"; }
  return { hours: Math.max(0, Math.min(hours, cap)), basis };
}

/** Projected hours/billable for one consultant on dateMs. Stale allocations (ended before asOf) are ignored. */
export function projectConsultantAt(rec, asOfMs, dateMs, events) {
  const { consultant: c, util, billable } = rec;
  let hours = util.allocatedHours || 0, bill = billable.hours;
  for (const a of util.allocations || []) {
    const e = parseDate(a.endDate);
    if (Number.isNaN(e) || e < asOfMs) continue;
    if (e < dateMs) {
      const h = Number(a.weeklyHours) || 0;
      hours -= h;
      if (!isInternal(a)) bill -= h;
    }
  }
  for (const ev of events || []) {
    if (ev.type === "holiday" || ev.consultantId !== c.id || !ev.hoursDelta) continue;
    const e = parseDate(ev.date);
    if (e > asOfMs && e <= dateMs) { hours += ev.hoursDelta; bill += ev.hoursDelta; }
  }
  const cap = util.capacityHours || 40;
  hours = Math.max(0, hours);
  bill = Math.max(0, Math.min(bill, cap));
  return { hours: round1(hours), billable: round1(bill), pct: Math.round((hours / cap) * 100) };
}

/** Weekdays covered by holiday events inside [startMs, startMs + days). */
export function holidayWeekdays(events, startMs, days = 7) {
  const set = new Set();
  for (const ev of events || []) {
    if (ev.type !== "holiday") continue;
    const from = parseDate(ev.date);
    const to = ev.endDate ? parseDate(ev.endDate) : from;
    if (Number.isNaN(from) || Number.isNaN(to)) continue;
    for (let d = Math.max(from, startMs); d <= Math.min(to, startMs + (days - 1) * DAY_MS); d += DAY_MS) {
      const wd = new Date(d).getUTCDay();
      if (wd !== 0 && wd !== 6) set.add(d);
    }
  }
  return set.size;
}

function severityFor(gap) { return gap >= 40 ? "high" : gap >= 20 ? "medium" : "low"; }

/**
 * Flag bench risks. A consultant is a bench risk when utilization < their threshold today
 * ("current") or is projected to drop below it inside the horizon ("projected").
 * The flag captures the skill profile needed for downstream demand matching.
 */
export function detectBenchRisks(records, { config, asOfMs, horizonMs, events }) {
  const risks = [];
  for (const rec of records) {
    const c = rec.consultant, util = rec.util;
    const threshold = config.overrides[c.id] ?? config.consultantThresholdPct;
    const cap = util.capacityHours || 40;

    const dates = new Set([asOfMs]);
    const causesAt = new Map();
    const addCause = (ms, text) => { if (!causesAt.has(ms)) causesAt.set(ms, []); causesAt.get(ms).push(text); };
    for (const a of util.allocations || []) {
      const e = parseDate(a.endDate);
      if (Number.isNaN(e) || e < asOfMs || e + DAY_MS > horizonMs) continue;
      dates.add(e + DAY_MS);
      addCause(e + DAY_MS, `"${a.projectName || "allocation"}" (${Number(a.weeklyHours) || 0}h/wk) ends ${a.endDate}`);
    }
    for (const ev of events) {
      if (ev.type === "holiday" || ev.consultantId !== c.id || !ev.hoursDelta) continue;
      const e = parseDate(ev.date);
      if (e > asOfMs && e <= horizonMs) { dates.add(e); addCause(e, `${ev.label} (${ev.hoursDelta > 0 ? "+" : ""}${ev.hoursDelta}h/wk)`); }
    }

    const timeline = [...dates].sort((a, b) => a - b).map(ms => {
      if (ms === asOfMs) return { date: toISO(ms), hours: util.allocatedHours, pct: util.pct, causes: [] };
      const p = projectConsultantAt(rec, asOfMs, ms, events);
      return { date: toISO(ms), hours: p.hours, pct: p.pct, causes: causesAt.get(ms) || [] };
    });

    const first = timeline.find(p => p.pct < threshold);
    if (!first) continue;
    const gap = threshold - first.pct;
    const riskType = first.date === toISO(asOfMs) ? "current" : "projected";
    const recovery = timeline.find(p => p.date > first.date && p.pct >= threshold);
    const reason = riskType === "current"
      ? `${c.name} is at ${util.pct}% utilization, ${gap} pt(s) below the ${threshold}% threshold.` +
        (recovery ? ` Expected to recover to ${recovery.pct}% on ${recovery.date} (${recovery.causes.join("; ")}).` : "")
      : `${c.name} is at ${util.pct}% today but projected to fall to ${first.pct}% on ${first.date}, ${gap} pt(s) below the ${threshold}% threshold: ${first.causes.join("; ") || "scheduled changes"}.`;

    risks.push({
      id: `BR-${c.id}`,
      consultantId: c.id,
      name: c.name,
      riskType,
      severity: severityFor(gap),
      thresholdPct: threshold,
      currentPct: util.pct,
      riskPct: first.pct,
      gapPts: gap,
      riskDate: first.date,
      daysUntilRisk: Math.round((parseDate(first.date) - asOfMs) / DAY_MS),
      freeHoursAtRisk: round1(Math.max(0, cap - first.hours)),
      recoversOn: recovery ? recovery.date : "",
      reason,
      timeline,
      // Captured for downstream matching.
      skillProfile: {
        skills: [...(c.skills || [])], jrs: c.jrs || "", band: c.band, certifications: [...(c.certifications || [])],
        industries: [...(c.industries || [])], location: c.location || "", travelWillingness: !!c.travelWillingness,
        dept: c.dept || "", manager: c.manager || "", availableFrom: first.date,
      },
    });
  }
  const order = { high: 0, medium: 1, low: 2 };
  return risks.sort((a, b) => order[a.severity] - order[b.severity] || a.riskDate.localeCompare(b.riskDate) || a.riskPct - b.riskPct);
}

// ─── Demand pool & matching ──────────────────────────────────────────────────

/** Combine forecast rows and open roles into one 90-day demand pool (all comparable role objects). */
export function buildDemandPool({ forecast, roles, config, asOfMs, horizonMs }) {
  const items = [];
  let skipped = 0;
  const inWindow = (start, end) => {
    const s = parseDate(start), e = end ? parseDate(end) : NaN;
    if (Number.isNaN(s)) return false;
    return s <= horizonMs && (Number.isNaN(e) || e >= asOfMs);
  };
  for (const f of forecast || []) {
    if (!inWindow(f.startDate, f.endDate)) continue;
    items.push({
      id: f.id, source: "forecast", title: f.roleTitle, client: f.client, startDate: f.startDate, endDate: f.endDate,
      hoursPerWeek: f.hoursPerWeek, probability: f.probability, notes: f.notes,
      role: {
        roleTitle: f.roleTitle, client: f.client, jrs: f.jrs, bandMin: f.bandMin, bandMax: f.bandMax,
        requiredSkills: f.skills, niceToHaveSkills: f.niceToHaveSkills || [], certifications: [],
        requiredIndustry: "", niceToHaveIndustries: [], location: f.location || "", travelRequired: !!f.travelRequired,
        startDate: f.startDate, endDate: f.endDate, weeklyHours: f.hoursPerWeek,
      },
    });
  }
  for (const r of roles || []) {
    if (r.status && !/open/i.test(String(r.status))) continue;
    if (Number.isNaN(parseDate(r.startDate))) { skipped++; continue; }
    if (!inWindow(r.startDate, r.endDate)) continue;
    items.push({
      id: r.id, source: "open-role", title: r.roleTitle, client: r.client, startDate: r.startDate, endDate: r.endDate || "",
      hoursPerWeek: Number(r.weeklyHours) || 40,
      probability: r.contractSigned ? 100 : config.unsignedRoleProbability,
      notes: r.contractSigned ? "Contract signed" : "Contract pending",
      role: {
        ...r,
        requiredSkills: r.requiredSkills || [], niceToHaveSkills: r.niceToHaveSkills || [], certifications: r.certifications || [],
        niceToHaveIndustries: r.niceToHaveIndustries || [], requiredIndustry: r.requiredIndustry || "", location: r.location || "",
      },
    });
  }
  return { items, skipped };
}

/** Score every demand item for one bench risk. Uses the injected scoreConsultant. */
export function matchRisk(risk, rec, pool, scoreFn, config) {
  // Availability for scoring is the date the consultant frees up, not today.
  const cons = { ...rec.consultant, availabilityDate: risk.riskDate };
  const have = new Set((rec.consultant.skills || []).map(normSkill));
  const matches = [];
  for (const d of pool) {
    let score;
    try { score = scoreFn(cons, d.role).overallScore; } catch { continue; }
    const req = (d.role.requiredSkills || []).map(String);
    const matched = req.filter(s => have.has(normSkill(s)));
    const coverage = req.length ? Math.round((matched.length / req.length) * 100) : 100;
    const capacityOk = risk.freeHoursAtRisk >= 0.5 * d.hoursPerWeek;
    const why = [];
    if (score < config.minMatchScore) why.push(`score ${score} < ${config.minMatchScore}`);
    if (coverage < config.minSkillCoverage) why.push(`skill coverage ${coverage}% < ${config.minSkillCoverage}%`);
    if (!capacityOk) why.push(`free ${risk.freeHoursAtRisk}h < half of ${d.hoursPerWeek}h/wk`);
    matches.push({
      demandId: d.id, source: d.source, title: d.title, client: d.client, startDate: d.startDate,
      hoursPerWeek: d.hoursPerWeek, probability: d.probability, score, coverage,
      matchedSkills: matched, missingSkills: req.filter(s => !have.has(normSkill(s))),
      capacityOk, qualifies: why.length === 0, why,
    });
  }
  matches.sort((a, b) => Number(b.qualifies) - Number(a.qualifies) || b.score - a.score || b.probability - a.probability || a.startDate.localeCompare(b.startDate));
  return matches;
}

/** Skills most requested by demand (probability-weighted) that this consultant lacks. */
export function skillGapsFor(rec, pool, limit = 3) {
  const have = new Set((rec.consultant.skills || []).map(normSkill));
  const tally = new Map();
  for (const d of pool) for (const s of d.role.requiredSkills || []) {
    if (have.has(normSkill(s))) continue;
    tally.set(s, (tally.get(s) || 0) + d.probability / 100);
  }
  return [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([skill, weight]) => ({ skill, weight: round1(weight) }));
}

// ─── Recommendations ─────────────────────────────────────────────────────────

/**
 * Rule set (first applicable per bench risk):
 *  1. allocate  — best qualifying demand match (score, skill coverage and capacity rules all pass)
 *  2. rebalance — no qualifying demand, but an over-allocated peer has work this person scores >= minMatchScore on
 *  3. develop   — nothing fits; point at the most-requested missing skills
 */
export function buildRecommendations({ risks, recById, pool, scoreFn, config, records, recStates }) {
  const recs = [];
  const over = records.filter(r => r.util.status === "over");
  // Each demand item is one seat: once recommended to a consultant it is not offered to another.
  const taken = new Map();
  for (const risk of risks) {
    const rec = recById.get(risk.consultantId);
    const best = risk.matches.find(m => m.qualifies && !taken.has(m.demandId));
    const takenBy = risk.matches.filter(m => m.qualifies && taken.has(m.demandId)).map(m => `"${m.title}" is already recommended for ${taken.get(m.demandId)}.`);
    const base = { consultantId: risk.consultantId, name: risk.name, priority: risk.severity, riskId: risk.id };
    if (best) {
      taken.set(best.demandId, risk.name);
      recs.push({
        ...base, id: `REC|allocate|${risk.consultantId}|${best.demandId}`, type: "allocate", demandId: best.demandId,
        title: `Allocate ${risk.name} to "${best.title}"${best.client ? ` (${best.client})` : ""}`,
        detail: `Starts ${best.startDate}; ${risk.name} is free from ${risk.riskDate} with ${risk.freeHoursAtRisk}h/wk available.`,
        evidence: [
          `Match score ${best.score} (min ${config.minMatchScore})`,
          `Required-skill coverage ${best.coverage}% (min ${config.minSkillCoverage}%): ${best.matchedSkills.join(", ") || "none"}`,
          `Demand likelihood ${best.probability}% (${best.source === "forecast" ? "forecast" : "open role"})`,
          `Capacity ${risk.freeHoursAtRisk}h free vs ${best.hoursPerWeek}h/wk needed`,
        ],
        hours: Math.min(best.hoursPerWeek, risk.freeHoursAtRisk), fromDate: best.startDate, probability: best.probability,
      });
      continue;
    }
    // rebalance
    let rebalance = null;
    for (const o of over) {
      if (o.consultant.id === risk.consultantId) continue;
      const excess = round1(o.util.allocatedHours - o.util.capacityHours);
      const hrs = Math.min(excess, risk.freeHoursAtRisk);
      if (hrs <= 0) continue;
      const pseudo = {
        jrs: o.consultant.jrs, bandMin: Math.max(1, o.consultant.band - 1), bandMax: o.consultant.band + 1,
        requiredSkills: (o.consultant.skills || []).slice(0, 5), niceToHaveSkills: (o.consultant.skills || []).slice(5),
        certifications: [], requiredIndustry: "", niceToHaveIndustries: [], location: o.consultant.location || "",
        travelRequired: false, startDate: risk.riskDate, weeklyHours: hrs,
      };
      let score;
      try { score = scoreFn({ ...rec.consultant, availabilityDate: risk.riskDate }, pseudo).overallScore; } catch { continue; }
      if (score >= config.minMatchScore && (!rebalance || score > rebalance.score)) rebalance = { from: o, score, hrs };
    }
    if (rebalance) {
      recs.push({
        ...base, id: `REC|rebalance|${risk.consultantId}|${rebalance.from.consultant.id}`, type: "rebalance",
        title: `Shift ~${rebalance.hrs}h/wk from ${rebalance.from.consultant.name} to ${risk.name}`,
        detail: `${rebalance.from.consultant.name} is at ${rebalance.from.util.pct}% (over capacity); ${risk.name} has capacity from ${risk.riskDate}.`,
        evidence: [
          `Profile match score ${rebalance.score} (min ${config.minMatchScore})`,
          `${rebalance.from.consultant.name} excess ${round1(rebalance.from.util.allocatedHours - rebalance.from.util.capacityHours)}h; ${risk.name} free ${risk.freeHoursAtRisk}h`,
          "No qualifying forecast/open-role demand in the horizon",
        ],
        hours: rebalance.hrs, fromDate: risk.riskDate, probability: 100,
      });
      continue;
    }
    const gaps = skillGapsFor(rec, pool);
    recs.push({
      ...base, id: `REC|develop|${risk.consultantId}`, type: "develop",
      title: `No demand fit for ${risk.name} — redeploy internally or upskill`,
      detail: (takenBy.length ? takenBy.join(" ") + " " : "") + (gaps.length
        ? `Most-requested skills ${risk.name} lacks: ${gaps.map(g => g.skill).join(", ")}.`
        : (pool.length ? "Demand exists but none meets score/coverage/capacity rules." : "No demand forecast or open roles loaded for the horizon.")),
      evidence: risk.matches.slice(0, 2).map(m => `Closest: "${m.title}" — ${m.why.join("; ") || "ok"}`),
      hours: risk.freeHoursAtRisk, fromDate: risk.riskDate, probability: 0,
    });
  }
  return recs.map(r => ({ ...r, status: (recStates && recStates[r.id] && recStates[r.id].status) || "pending" }));
}

// ─── Practice-level metrics ──────────────────────────────────────────────────

export function practiceChargeability(records) {
  const agg = rows => {
    const cap = rows.reduce((s, r) => s + (r.util.capacityHours || 0), 0);
    const bill = rows.reduce((s, r) => s + r.billable.hours, 0);
    return { capacityHours: round1(cap), billableHours: round1(bill), pct: cap > 0 ? round1((bill / cap) * 100) : null, headcount: rows.length };
  };
  const depts = [...new Set(records.map(r => r.consultant.dept || "Unassigned"))].sort();
  return {
    ...agg(records),
    estimatedCount: records.filter(r => r.billable.basis === "estimated").length,
    byDept: depts.map(d => ({ dept: d, ...agg(records.filter(r => (r.consultant.dept || "Unassigned") === d)) })),
  };
}

/** Weekly practice chargeability projection. additions = [{fromMs, hours, probability}] for the "with recommendations" scenario. */
export function projectPractice(records, { asOfMs, weeks, events, scaleHolidays = true, additions = [] }) {
  const capacity = records.reduce((s, r) => s + (r.util.capacityHours || 0), 0);
  const out = [];
  for (let w = 0; w <= weeks; w++) {
    const ms = asOfMs + w * 7 * DAY_MS;
    let bill = records.reduce((s, r) => s + projectConsultantAt(r, asOfMs, ms, events).billable, 0);
    for (const a of additions) if (ms >= a.fromMs) bill += a.hours * (a.probability / 100);
    const hd = w > 0 && scaleHolidays ? holidayWeekdays(events, ms, 7) : 0;
    const scaled = bill * (1 - hd / 5);
    out.push({ week: w, date: toISO(ms), holidayDays: hd, billable: round1(scaled), capacity: round1(capacity), pct: capacity > 0 ? round1((scaled / capacity) * 100) : null });
  }
  return out;
}

// ─── Forecast accuracy ───────────────────────────────────────────────────────

/** Compare each snapshot's 30-day prediction with the snapshot taken nearest the target date. */
export function evaluateForecasts(history, toleranceDays = 3) {
  const snaps = [...(history || [])].sort((a, b) => a.date.localeCompare(b.date));
  const results = [];
  for (const s of snaps) {
    if (!s.predicted) continue;
    const target = parseDate(s.predicted.targetDate);
    if (Number.isNaN(target)) continue;
    let actual = null, best = Infinity;
    for (const a of snaps) {
      if (a.date <= s.date) continue;
      const d = Math.abs(parseDate(a.date) - target) / DAY_MS;
      if (d <= toleranceDays && d < best) { best = d; actual = a; }
    }
    if (!actual) continue;
    const pr = new Set(s.predicted.riskIds || []), ar = new Set(actual.belowNowIds || []);
    const union = new Set([...pr, ...ar]);
    const inter = [...pr].filter(x => ar.has(x)).length;
    results.push({
      madeOn: s.date, targetDate: s.predicted.targetDate, actualOn: actual.date,
      predictedPct: s.predicted.chargeability, actualPct: actual.chargeability,
      errorPts: round1(Math.abs(s.predicted.chargeability - actual.chargeability)),
      riskPredicted: pr.size, riskActual: ar.size, riskOverlap: inter,
      riskAgreement: union.size === 0 ? 100 : Math.round((inter / union.size) * 100),
    });
  }
  if (!results.length) return { count: 0, results, chargeabilityAccuracy: null, riskAgreement: null, meanErrorPts: null };
  const meanErr = results.reduce((s, r) => s + r.errorPts, 0) / results.length;
  return {
    count: results.length, results,
    meanErrorPts: round1(meanErr),
    chargeabilityAccuracy: Math.max(0, round1(100 - meanErr)),
    riskAgreement: Math.round(results.reduce((s, r) => s + r.riskAgreement, 0) / results.length),
  };
}

// ─── Orchestrator ────────────────────────────────────────────────────────────

/**
 * Compute the whole framework in one pass.
 * inputs: { consultants, roles, forecast, events, config, recStates, history, calcUtilization, scoreConsultant, today? }
 */
export function computeFramework(inputs) {
  const { consultants = [], roles = [], forecast = [], events = [], recStates = {}, history = [] } = inputs;
  const { calcUtilization, scoreConsultant } = inputs;
  const config = validateConfig(inputs.config).config;
  const asOf = config.asOfDate || inputs.today || todayISO();
  const asOfMs = parseDate(asOf);
  const horizonMs = asOfMs + config.horizonDays * DAY_MS;

  const records = [];
  const warnings = [];
  for (const c of consultants) {
    try {
      const util = calcUtilization(c);
      records.push({ consultant: c, util, billable: billableHours(util) });
    } catch { warnings.push(`Skipped ${c && c.name ? c.name : "a consultant"}: utilization could not be calculated.`); }
  }
  const recById = new Map(records.map(r => [r.consultant.id, r]));

  const staleCount = records.filter(r => (r.util.allocations || []).some(a => { const e = parseDate(a.endDate); return !Number.isNaN(e) && e < asOfMs; })).length;
  if (staleCount) warnings.push(`${staleCount} consultant(s) have allocations whose end date is before ${asOf}; those allocations are ignored for projections.`);
  const estimated = records.filter(r => r.util.inferred).length;
  if (estimated) warnings.push(`${estimated} consultant(s) use estimated utilization (no allocation detail); their projections cannot show roll-offs.`);

  const pool = buildDemandPool({ forecast, roles, config, asOfMs, horizonMs });
  if (pool.skipped) warnings.push(`${pool.skipped} open role(s) skipped: invalid start date.`);
  if (!pool.items.length) warnings.push("No demand (forecast or open roles) falls inside the horizon; bench risks cannot be matched.");

  const risks = detectBenchRisks(records, { config, asOfMs, horizonMs, events });
  for (const r of risks) r.matches = matchRisk(r, recById.get(r.consultantId), pool.items, scoreConsultant, config);

  const recommendations = buildRecommendations({ risks, recById, pool: pool.items, scoreFn: scoreConsultant, config, records, recStates });

  const practice = practiceChargeability(records);
  const weeks = Math.ceil(config.horizonDays / 7);
  const baseline = projectPractice(records, { asOfMs, weeks, events });
  const additions = recommendations
    .filter(r => r.type === "allocate" && r.status !== "dismissed")
    .map(r => ({ fromMs: parseDate(r.fromDate), hours: r.hours, probability: r.probability }));
  const withRecs = projectPractice(records, { asOfMs, weeks, events, additions });

  const matched = risks.filter(r => r.matches.some(m => m.qualifies)).length;
  const prior = [...history].filter(s => s.date < asOf).sort((a, b) => a.date.localeCompare(b.date));
  const prev = prior[prior.length - 1] || null;

  const doneIds = Object.entries(recStates).filter(([, v]) => v && v.status === "completed").length;
  const open = recommendations.filter(r => r.status === "pending" || r.status === "accepted").length;
  const accepted = recommendations.filter(r => r.status === "accepted").length;
  const dismissed = Object.values(recStates).filter(v => v && v.status === "dismissed").length;

  // 30-day prediction stored in the snapshot, later compared with reality by evaluateForecasts().
  const targetMs = asOfMs + 30 * DAY_MS;
  const predictedRisk = records.filter(r => projectConsultantAt(r, asOfMs, targetMs, events).pct < (config.overrides[r.consultant.id] ?? config.consultantThresholdPct)).map(r => r.consultant.id);
  const predCap = records.reduce((s, r) => s + r.util.capacityHours, 0);
  const predBill = records.reduce((s, r) => s + projectConsultantAt(r, asOfMs, targetMs, events).billable, 0);

  const avgUtil = records.length ? Math.round(records.reduce((s, r) => s + r.util.pct, 0) / records.length) : 0;
  const snapshot = {
    date: asOf,
    chargeability: practice.pct ?? 0,
    target: config.practiceTargetPct,
    avgUtil,
    headcount: records.length,
    benchRiskCurrent: risks.filter(r => r.riskType === "current").length,
    benchRiskProjected: risks.filter(r => r.riskType === "projected").length,
    benchRiskTotal: risks.length,
    riskIds: risks.map(r => r.consultantId),
    belowNowIds: records.filter(r => r.util.pct < (config.overrides[r.consultant.id] ?? config.consultantThresholdPct)).map(r => r.consultant.id),
    matched, skillMatchRate: risks.length ? Math.round((matched / risks.length) * 100) : null,
    recsOpen: open, recsCompleted: doneIds,
    predicted: { targetDate: toISO(targetMs), chargeability: predCap > 0 ? round1((predBill / predCap) * 100) : 0, riskIds: predictedRisk },
  };

  const accuracy = evaluateForecasts([...history.filter(s => s.date !== asOf), snapshot]);
  const chargeGap = practice.pct === null ? null : round1(practice.pct - config.practiceTargetPct);

  return {
    asOf, horizonEnd: toISO(horizonMs), config, records, warnings, demand: pool, risks, recommendations,
    practice, baseline, withRecs, snapshot, accuracy,
    kpis: {
      chargeability: {
        current: practice.pct, target: config.practiceTargetPct, gap: chargeGap,
        status: chargeGap === null ? "na" : chargeGap >= 0 ? "good" : chargeGap >= -5 ? "warn" : "bad",
        formula: `Σ billable hrs/wk ÷ Σ capacity hrs/wk = ${practice.billableHours}h ÷ ${practice.capacityHours}h`,
      },
      benchRisk: {
        total: risks.length, current: snapshot.benchRiskCurrent, projected: snapshot.benchRiskProjected,
        high: risks.filter(r => r.severity === "high").length,
        previous: prev ? prev.benchRiskTotal : null, delta: prev ? risks.length - prev.benchRiskTotal : null, previousDate: prev ? prev.date : null,
      },
      skillMatch: {
        rate: snapshot.skillMatchRate, matched, total: risks.length,
        formula: `bench risks with ≥1 qualifying demand match ÷ all bench risks = ${matched} ÷ ${risks.length}`,
      },
      actions: {
        open, accepted, completed: doneIds, dismissed,
        completionRate: open + doneIds > 0 ? Math.round((doneIds / (open + doneIds)) * 100) : null,
      },
      forecastAccuracy: accuracy,
    },
  };
}
