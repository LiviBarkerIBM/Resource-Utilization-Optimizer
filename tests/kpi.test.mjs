// Run: node --test tests/
// The KPI engine receives calcUtilization / scoreConsultant by injection, so it is tested with stubs
// and never needs the browser or index.html.
import test from "node:test";
import assert from "node:assert/strict";
import {
  validateConfig, validateForecastRows, validateEventRows, parseDate, parseDateLoose, addDays,
  billableHours, projectConsultantAt, holidayWeekdays, computeFramework, evaluateForecasts, DEFAULT_CONFIG,
} from "../src/engine/kpi.js";
import { sampleForecast, sampleEvents, sampleHistory, DEMO_AS_OF } from "../src/data/kpiSamples.js";
import * as store from "../src/data/kpiStore.js";

const ASOF = "2026-08-20";

// Minimal stand-in for the app's calcUtilization (same return shape).
function calcUtilization(c) {
  const cap = c.weeklyCapacity || 40;
  const allocs = c.currentAllocations || [];
  const hrs = allocs.reduce((s, a) => s + (a.weeklyHours || 0), 0);
  const pct = Math.round((hrs / cap) * 100);
  return { allocatedHours: hrs, capacityHours: cap, pct, status: hrs === 0 ? "bench" : pct > 100 ? "over" : pct >= 70 ? "full" : "partial", freeHours: Math.max(0, cap - hrs), allocations: allocs, inferred: false, weeklyHoursData: null };
}
// Deterministic stand-in: score = % of required skills held (so tests are easy to reason about).
function scoreConsultant(c, r) {
  const have = new Set(c.skills.map(s => s.toLowerCase()));
  const req = r.requiredSkills || [];
  const hit = req.filter(s => have.has(s.toLowerCase())).length;
  return { overallScore: req.length ? Math.round((hit / req.length) * 100) : 100 };
}
const cons = (id, skills, allocs, extra = {}) => ({ id, name: `Name ${id}`, band: 7, jrs: "Engineer", dept: "D", skills, certifications: [], industries: [], location: "Austin, TX", travelWillingness: true, weeklyCapacity: 40, currentAllocations: allocs, ...extra });
const alloc = (hours, end, client = "Acme") => ({ projectName: `P-${hours}`, client, weeklyHours: hours, startDate: "2026-01-01", endDate: end });
const run = (over = {}) => computeFramework({ consultants: [], roles: [], forecast: [], events: [], history: [], calcUtilization, scoreConsultant, config: { asOfDate: ASOF }, ...over });
const fc = (o = {}) => ({ id: "F1", roleTitle: "Dev", client: "X", jrs: "Engineer", skills: ["Python"], niceToHaveSkills: [], hoursPerWeek: 40, probability: 100, bandMin: 1, bandMax: 99, startDate: addDays(ASOF, 20), endDate: "", ...o });

test("config validation rejects out-of-range values and keeps defaults", () => {
  const r = validateConfig({ consultantThresholdPct: 150, practiceTargetPct: "abc", horizonDays: 90.5 });
  assert.equal(r.ok, false);
  assert.equal(r.errors.length, 3);
  assert.equal(r.config.consultantThresholdPct, DEFAULT_CONFIG.consultantThresholdPct);
  assert.equal(validateConfig({}).ok, true);
  assert.equal(validateConfig({ asOfDate: "2026-02-31" }).ok, false);
});

test("date parsing is strict and tolerant of common formats", () => {
  assert.ok(Number.isNaN(parseDate("2026-02-31")));
  assert.equal(parseDateLoose("8/5/2026"), "2026-08-05");
  assert.equal(parseDateLoose(""), "");
  assert.equal(parseDateLoose("nope"), null);
  assert.equal(parseDateLoose(46000), "2025-12-09");
});

test("forecast rows: valid rows pass, bad rows report line numbers", () => {
  const { valid, errors } = validateForecastRows([
    { roleTitle: "A", jrs: "J", skills: "Python, SQL", startDate: "2026-09-01", probability: "80%" },
    { roleTitle: "", jrs: "J", skills: "", startDate: "bad" },
    { roleTitle: "B", jrs: "J", skills: "x", startDate: "2026-09-10", endDate: "2026-09-01" },
    { roleTitle: "C", jrs: "J", skills: "x", startDate: "2026-09-10", probability: 140 },
  ]);
  assert.equal(valid.length, 1);
  assert.equal(valid[0].probability, 80);
  assert.deepEqual(errors.map(e => e.line), [3, 4, 5]);
});

test("event rows: type, date and consultant rules", () => {
  const known = new Set(["C1"]);
  const { valid, errors } = validateEventRows([
    { type: "holiday", date: "2026-09-07", label: "Labor Day" },
    { type: "contract_transition", date: "2026-09-10", consultantId: "C1", hoursDelta: 20 },
    { type: "contract_transition", date: "2026-09-10", consultantId: "ZZ", hoursDelta: 20 },
    { type: "meeting", date: "2026-09-10" },
    { type: "holiday", date: "2026-13-40" },
    { type: "project_end", date: "2026-09-10", consultantId: "C1", hoursDelta: 10 },
  ], known);
  assert.equal(valid.length, 2);
  assert.equal(errors.length, 4);
});

test("billable hours: bench=0, weekly-hours basis, internal allocations excluded", () => {
  assert.deepEqual(billableHours({ status: "bench", capacityHours: 40, allocations: [] }), { hours: 0, basis: "allocations" });
  assert.equal(billableHours({ status: "full", capacityHours: 40, allocatedHours: 40, weeklyHoursData: { avgBillable: 30 }, allocations: [] }).basis, "weekly-hours");
  const b = billableHours({ status: "full", capacityHours: 40, allocatedHours: 50, allocations: [alloc(30, "2026-12-31"), alloc(10, "2026-12-31", "IBM Internal")] });
  assert.equal(b.hours, 30);
  assert.equal(billableHours({ status: "full", capacityHours: 40, allocatedHours: 20, allocations: [] }).basis, "estimated");
});

test("projection removes ended allocations and ignores stale ones", () => {
  const c = cons("A", [], [alloc(30, addDays(ASOF, 10)), alloc(10, addDays(ASOF, -5))]);
  const util = calcUtilization(c);
  const rec = { consultant: c, util, billable: billableHours(util) };
  const asOfMs = parseDate(ASOF);
  const later = projectConsultantAt(rec, asOfMs, asOfMs + 20 * 86400000, []);
  assert.equal(later.hours, 10); // 40 - 30 (the stale 10h entry stays because it was ended before as-of and is ignored)
});

test("holiday weekdays count only Mon–Fri inside the window", () => {
  const events = [{ type: "holiday", date: "2026-09-04", endDate: "2026-09-07" }]; // Fri..Mon
  assert.equal(holidayWeekdays(events, parseDate("2026-09-01"), 7), 2);
});

test("current bench risk flagged when utilization < threshold, with skill profile captured", () => {
  const r = run({ consultants: [cons("A", ["Python", "SQL"], [alloc(10, "2027-01-01")])], config: { asOfDate: ASOF, consultantThresholdPct: 70 } });
  assert.equal(r.risks.length, 1);
  const risk = r.risks[0];
  assert.equal(risk.riskType, "current");
  assert.equal(risk.currentPct, 25);
  assert.equal(risk.gapPts, 45);
  assert.equal(risk.severity, "high");
  assert.deepEqual(risk.skillProfile.skills, ["Python", "SQL"]);
  assert.match(risk.reason, /below the 70% threshold/);
});

test("threshold boundary: exactly at threshold is not a risk; per-person override applies", () => {
  const c = cons("A", ["x"], [alloc(28, "2027-01-01")]); // 70%
  assert.equal(run({ consultants: [c] }).risks.length, 0);
  assert.equal(run({ consultants: [c], config: { asOfDate: ASOF, overrides: { A: 80 } } }).risks.length, 1);
});

test("projected risk appears when an allocation ends inside the horizon, not beyond it", () => {
  const inside = cons("A", ["x"], [alloc(40, addDays(ASOF, 30))]);
  const beyond = cons("B", ["x"], [alloc(40, addDays(ASOF, 120))]);
  const r = run({ consultants: [inside, beyond] });
  assert.equal(r.risks.length, 1);
  assert.equal(r.risks[0].consultantId, "A");
  assert.equal(r.risks[0].riskType, "projected");
  assert.equal(r.risks[0].riskDate, addDays(ASOF, 31));
  assert.equal(r.risks[0].daysUntilRisk, 31);
});

test("contract-transition event can create or cure a risk", () => {
  const c = cons("A", ["x"], [alloc(10, "2027-01-01")]);
  const cured = run({ consultants: [c], events: [{ id: "E", type: "contract_transition", date: addDays(ASOF, 10), endDate: "", label: "SOW", consultantId: "A", hoursDelta: 30 }] });
  assert.equal(cured.risks[0].recoversOn, addDays(ASOF, 10));
  const hit = run({ consultants: [cons("B", ["x"], [alloc(40, "2027-01-01")])], events: [{ id: "E", type: "contract_transition", date: addDays(ASOF, 10), endDate: "", label: "Scope cut", consultantId: "B", hoursDelta: -30 }] });
  assert.equal(hit.risks[0].riskType, "projected");
});

test("skill matching: qualifying demand yields an allocate recommendation with evidence", () => {
  const r = run({ consultants: [cons("A", ["Python"], [])], forecast: [fc()] });
  assert.equal(r.kpis.skillMatch.rate, 100);
  const rec = r.recommendations[0];
  assert.equal(rec.type, "allocate");
  assert.equal(rec.status, "pending");
  assert.ok(rec.evidence.length >= 3);
});

test("one demand seat is recommended to only one consultant", () => {
  const r = run({ consultants: [cons("A", ["Python"], []), cons("B", ["Python"], [])], forecast: [fc()] });
  const allocs = r.recommendations.filter(x => x.type === "allocate");
  assert.equal(allocs.length, 1);
  const other = r.recommendations.find(x => x.type !== "allocate");
  assert.ok(other, "second consultant gets a different recommendation");
  assert.match(other.detail, /already recommended for/);
  assert.equal(r.kpis.skillMatch.rate, 100); // both *could* fill it; the match KPI measures fit, not seat count
});

test("no skill overlap -> develop recommendation naming the missing skill; match rate 0", () => {
  const r = run({ consultants: [cons("A", ["Java"], [])], forecast: [fc({ skills: ["Quantum"] })] });
  assert.equal(r.kpis.skillMatch.rate, 0);
  assert.equal(r.recommendations[0].type, "develop");
  assert.match(r.recommendations[0].detail, /Quantum/);
});

test("capacity rule blocks a match when free hours are under half of the demand", () => {
  // 30h allocation ending in 5 days -> after that 40h free; but demand starts now and person has 10h free today (current risk at 75% is not a risk)
  const c = cons("A", ["Python"], [alloc(10, "2027-01-01")]); // 25% -> current risk, free 30h
  const r = run({ consultants: [c], forecast: [fc({ hoursPerWeek: 80 })] });
  assert.equal(r.risks[0].matches[0].capacityOk, false);
  assert.equal(r.risks[0].matches[0].qualifies, false);
});

test("demand outside the horizon or already ended is excluded", () => {
  const r = run({ consultants: [cons("A", ["Python"], [])], forecast: [fc({ startDate: addDays(ASOF, 200) }), fc({ id: "F2", startDate: addDays(ASOF, -90), endDate: addDays(ASOF, -10) })] });
  assert.equal(r.demand.items.length, 0);
  assert.ok(r.warnings.some(w => /No demand/.test(w)));
});

test("open roles feed demand; unsigned roles are probability-weighted", () => {
  const role = { id: "R1", roleTitle: "Dev", client: "C", jrs: "Engineer", requiredSkills: ["Python"], niceToHaveSkills: [], certifications: [], startDate: addDays(ASOF, 15), weeklyHours: 40, status: "Open", contractSigned: false, bandMin: 1, bandMax: 99 };
  const r = run({ consultants: [cons("A", ["Python"], [])], roles: [role, { ...role, id: "R2", status: "Filled" }, { ...role, id: "R3", startDate: "garbage" }] });
  assert.equal(r.demand.items.length, 1);
  assert.equal(r.demand.items[0].probability, 50);
  assert.equal(r.demand.skipped, 1);
});

test("rebalance recommendation uses an over-allocated peer when no demand fits", () => {
  const over = cons("O", ["Python", "SQL"], [alloc(30, "2027-01-01"), alloc(20, "2027-01-01")]);
  const idle = cons("A", ["Python", "SQL"], []);
  const r = run({ consultants: [over, idle] });
  const rec = r.recommendations.find(x => x.consultantId === "A");
  assert.equal(rec.type, "rebalance");
  assert.match(rec.title, /Shift ~10h/);
});

test("chargeability = billable / capacity and compares to target", () => {
  const r = run({ consultants: [cons("A", [], [alloc(40, "2027-01-01")]), cons("B", [], [])] });
  assert.equal(r.kpis.chargeability.current, 50);
  assert.equal(r.kpis.chargeability.gap, -25);
  assert.equal(r.kpis.chargeability.status, "bad");
});

test("empty roster and zero-capacity consultants do not crash or divide by zero", () => {
  const empty = run();
  assert.equal(empty.kpis.chargeability.current, null);
  assert.equal(empty.kpis.skillMatch.rate, null);
  const zero = run({ consultants: [cons("Z", [], [], { weeklyCapacity: 0 })] });
  assert.ok(Array.isArray(zero.risks));
});

test("a failing calcUtilization skips that consultant with a warning", () => {
  const r = run({ consultants: [cons("A", [], []), cons("B", [], [])], calcUtilization: c => { if (c.id === "B") throw new Error("x"); return calcUtilization(c); } });
  assert.equal(r.records.length, 1);
  assert.ok(r.warnings.some(w => /Skipped/.test(w)));
});

test("recommendation status persists via recStates and drives action KPIs", () => {
  const first = run({ consultants: [cons("A", ["Python"], [])], forecast: [fc()] });
  const id = first.recommendations[0].id;
  const r = run({ consultants: [cons("A", ["Python"], [])], forecast: [fc()], recStates: { [id]: { status: "completed" } } });
  assert.equal(r.kpis.actions.completed, 1);
  assert.equal(r.kpis.actions.open, 0);
  assert.equal(r.kpis.actions.completionRate, 100);
});

test("bench-risk trend compares with the previous snapshot", () => {
  const r = run({ consultants: [cons("A", [], [])], history: [{ date: "2026-08-13", chargeability: 50, benchRiskTotal: 3, benchRiskCurrent: 3, benchRiskProjected: 0 }] });
  assert.equal(r.kpis.benchRisk.previous, 3);
  assert.equal(r.kpis.benchRisk.delta, -2);
});

test("forecast accuracy compares a 30-day prediction with the later actual", () => {
  const acc = evaluateForecasts([
    { date: "2026-07-01", chargeability: 70, predicted: { targetDate: "2026-07-31", chargeability: 66, riskIds: ["A", "B"] }, belowNowIds: [] },
    { date: "2026-07-31", chargeability: 64, predicted: { targetDate: "2026-08-30", chargeability: 60, riskIds: [] }, belowNowIds: ["A", "C"] },
  ]);
  assert.equal(acc.count, 1);
  assert.equal(acc.meanErrorPts, 2);
  assert.equal(acc.chargeabilityAccuracy, 98);
  assert.equal(acc.riskAgreement, 33); // overlap 1 / union 3
  assert.equal(evaluateForecasts([]).chargeabilityAccuracy, null);
});

test("sample data demonstrates the 90-day look-ahead and is itself valid", () => {
  const f = validateForecastRows(sampleForecast());
  assert.equal(f.errors.length, 0);
  const e = validateEventRows(sampleEvents());
  assert.equal(e.errors.length, 0);
  assert.ok(sampleHistory().length >= 6);
  // Same roster shape as the app's built-in sample data: bench people + allocations ending inside the window.
  const roster = [
    cons("C001", ["AWS", "Terraform", "Solution Architecture"], []),
    cons("C003", ["React", "Node.js", "REST APIs"], [alloc(20, "2026-10-01")]),
    cons("C006", ["Python", "Spark", "Databricks", "SQL"], [alloc(32, "2026-09-10")]),
  ];
  const r = run({ consultants: roster, forecast: f.valid, events: e.valid, history: sampleHistory(), config: { asOfDate: DEMO_AS_OF } });
  assert.equal(r.risks.length, 3);
  assert.ok(r.demand.items.length >= 6);
  assert.ok(r.kpis.skillMatch.rate > 0);
  assert.ok(r.baseline.length >= 13);
});

test("determinism: same inputs give identical output", () => {
  const args = { consultants: [cons("A", ["Python"], [alloc(10, addDays(ASOF, 30))])], forecast: [fc()] };
  assert.deepEqual(JSON.stringify(run(args).risks), JSON.stringify(run(args).risks));
});

test("store: round-trips through an injected storage, and validates imported bundles", () => {
  const mem = new Map();
  const st = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v), removeItem: k => mem.delete(k) };
  assert.equal(store.hasSavedState(st), false);
  store.saveForecast([{ id: "F1" }], st);
  store.saveConfig({ consultantThresholdPct: 65, practiceTargetPct: 80 }, st);
  assert.equal(store.hasSavedState(st), true);
  const s = store.loadState(st);
  assert.equal(s.config.consultantThresholdPct, 65);
  assert.equal(s.forecast.length, 1);
  // corrupt JSON falls back safely
  mem.set(store.KEYS.events, "{not json");
  assert.deepEqual(store.loadState(st).events, []);
  // bundle
  const text = store.exportBundle({ config: s.config, forecast: sampleForecast(), events: sampleEvents(), history: [], recStates: {} });
  const back = store.importBundle(text);
  assert.equal(back.ok, true);
  assert.equal(back.state.forecast.length, sampleForecast().length);
  assert.equal(store.importBundle("garbage").ok, false);
  assert.equal(store.importBundle(JSON.stringify({ app: "other" })).ok, false);
  // history upsert is one-per-day and capped
  const h = store.upsertSnapshot([{ date: "2026-01-01" }], { date: "2026-01-01", x: 1 });
  assert.equal(h.length, 1);
  store.clearAll(st);
  assert.equal(store.hasSavedState(st), false);
});
