/**
 * Sample KPI inputs. Everything is expressed as day offsets from an as-of date so the
 * 90-day look-ahead is demonstrable on any date. The built-in roster is anchored around
 * late Aug 2026, so first-run demo mode pins the as-of date to DEMO_AS_OF.
 *
 * The history below is hand-written demo data (clearly flagged in the UI), used only so the
 * trend charts and forecast-accuracy KPI have something to show on first run.
 */
import { addDays } from "../engine/kpi.js";

export const DEMO_AS_OF = "2026-08-20";

export function sampleForecast(asOf = DEMO_AS_OF) {
  const d = n => addDays(asOf, n);
  return [
    { id: "F-001", roleTitle: "Cloud Landing Zone Architect", client: "Harbor Mutual (forecast)", jrs: "Cloud Solution Architect", bandMin: 7, bandMax: 9, skills: ["AWS", "Terraform", "Solution Architecture"], niceToHaveSkills: ["Security", "Kubernetes"], hoursPerWeek: 40, probability: 80, startDate: d(10), endDate: d(190), location: "Dallas, TX", travelRequired: true, notes: "Verbal award; SOW in legal review" },
    { id: "F-002", roleTitle: "Data Lakehouse Engineer", client: "Summit Health (forecast)", jrs: "Data Engineer", bandMin: 6, bandMax: 8, skills: ["Python", "Spark", "Databricks", "SQL"], niceToHaveSkills: ["Azure", "dbt"], hoursPerWeek: 40, probability: 70, startDate: d(21), endDate: d(200), location: "Chicago, IL", travelRequired: false, notes: "Follow-on to existing engagement" },
    { id: "F-003", roleTitle: "GenAI Platform Engineer", client: "Orion Retail (forecast)", jrs: "AI/ML Specialist", bandMin: 7, bandMax: 9, skills: ["Python", "LLMs", "NLP", "MLOps"], niceToHaveSkills: ["AWS", "PyTorch"], hoursPerWeek: 40, probability: 60, startDate: d(30), endDate: d(210), location: "San Jose, CA", travelRequired: true, notes: "Pipeline stage: proposal submitted" },
    { id: "F-004", roleTitle: "Full-Stack Modernization Developer", client: "Keystone Insurance (forecast)", jrs: "Application Developer", bandMin: 6, bandMax: 7, skills: ["Java", "Spring Boot", "REST APIs", "PostgreSQL"], niceToHaveSkills: ["Docker", "Kubernetes"], hoursPerWeek: 40, probability: 75, startDate: d(35), endDate: d(215), location: "New York, NY", travelRequired: false, notes: "" },
    { id: "F-005", roleTitle: "Platform Security Architect", client: "Federal Civilian Agency (forecast)", jrs: "Cloud Solution Architect", bandMin: 8, bandMax: 9, skills: ["GCP", "Security", "Networking", "Solution Architecture"], niceToHaveSkills: ["Kubernetes", "Terraform"], hoursPerWeek: 40, probability: 55, startDate: d(45), endDate: d(240), location: "Washington, DC", travelRequired: true, notes: "Recompete; award expected this quarter" },
    { id: "F-006", roleTitle: "Analytics Engineer (part-time)", client: "Atlas Logistics (forecast)", jrs: "Data Engineer", bandMin: 6, bandMax: 8, skills: ["SQL", "Power BI", "Python"], niceToHaveSkills: ["Azure"], hoursPerWeek: 20, probability: 90, startDate: d(14), endDate: d(120), location: "Boston, MA", travelRequired: false, notes: "Signed change order" },
    { id: "F-007", roleTitle: "React Experience Developer", client: "Beacon Education (forecast)", jrs: "Application Developer", bandMin: 5, bandMax: 7, skills: ["React", "TypeScript", "Node.js", "REST APIs"], niceToHaveSkills: ["PostgreSQL"], hoursPerWeek: 40, probability: 65, startDate: d(60), endDate: d(240), location: "Atlanta, GA", travelRequired: false, notes: "" },
    { id: "F-008", roleTitle: "Quantum-Safe Crypto Specialist", client: "Pinnacle Bank (forecast)", jrs: "Security Architect", bandMin: 8, bandMax: 9, skills: ["Cryptography", "PKI", "Quantum-Safe", "Security"], niceToHaveSkills: [], hoursPerWeek: 40, probability: 40, startDate: d(75), endDate: d(255), location: "Charlotte, NC", travelRequired: true, notes: "Early-stage; demonstrates a skill gap with no roster match" },
  ];
}

export function sampleEvents(asOf = DEMO_AS_OF) {
  const d = n => addDays(asOf, n);
  return [
    { id: "E-001", type: "holiday", date: d(18), endDate: "", label: "Labor Day", consultantId: "", hoursDelta: 0 },
    { id: "E-002", type: "holiday", date: d(53), endDate: "", label: "Company Recharge Day", consultantId: "", hoursDelta: 0 },
    { id: "E-003", type: "project_end", date: d(31), endDate: "", label: "Core Banking API program ends (Meridian)", consultantId: "", hoursDelta: 0 },
    { id: "E-004", type: "contract_transition", date: d(32), endDate: "", label: "NovaTech SOW signed — Maria Santos starts", consultantId: "C002", hoursDelta: 40 },
    { id: "E-005", type: "contract_transition", date: d(70), endDate: "", label: "Apex Logistics extension — Carlos Rivera +10h", consultantId: "C008", hoursDelta: 10 },
    { id: "E-006", type: "holiday", date: d(90), endDate: d(91), label: "Thanksgiving break (partial)", consultantId: "", hoursDelta: 0 },
  ];
}

/** Weekly snapshots 2026-06-25 .. 2026-08-13 (demo only). Each carries a 30-day prediction. */
export function sampleHistory() {
  const rows = [
    // date, charge%, riskTotal, matched, recsOpen, recsDone, belowNow ids, predicted charge, predicted risk ids
    ["2026-06-25", 71.0, 4, 2, 4, 0, ["C001", "C002", "C005", "C009"], 69.0, ["C001", "C002", "C005", "C009", "C003"]],
    ["2026-07-02", 70.5, 4, 3, 4, 1, ["C001", "C002", "C005", "C009"], 68.5, ["C001", "C002", "C005", "C009"]],
    ["2026-07-09", 68.0, 5, 3, 5, 1, ["C001", "C002", "C005", "C009", "C003"], 66.0, ["C001", "C002", "C005", "C003", "C006"]],
    ["2026-07-16", 66.5, 5, 3, 4, 2, ["C001", "C002", "C005", "C009", "C003"], 65.0, ["C001", "C002", "C005", "C003", "C006"]],
    ["2026-07-23", 65.0, 6, 4, 5, 2, ["C001", "C002", "C005", "C009", "C003"], 63.0, ["C001", "C002", "C005", "C009", "C003", "C006"]],
    ["2026-07-30", 64.0, 6, 4, 5, 3, ["C001", "C002", "C005", "C009", "C003", "C010"], 62.0, ["C001", "C002", "C005", "C009", "C003", "C010"]],
    ["2026-08-06", 63.5, 7, 4, 6, 3, ["C001", "C002", "C005", "C009", "C003", "C010"], 61.0, ["C001", "C002", "C005", "C009", "C003", "C010", "C006"]],
    ["2026-08-13", 62.5, 7, 5, 6, 4, ["C001", "C002", "C005", "C009", "C003", "C010"], 60.5, ["C001", "C002", "C005", "C009", "C003", "C010", "C006"]],
  ];
  const addD = (iso, n) => addDays(iso, n);
  return rows.map(([date, chargeability, total, matched, recsOpen, recsCompleted, belowNowIds, pc, pr]) => ({
    date, chargeability, target: 75, avgUtil: Math.round(chargeability + 8), headcount: 10,
    benchRiskCurrent: belowNowIds.length, benchRiskProjected: Math.max(0, total - belowNowIds.length), benchRiskTotal: total,
    riskIds: [...belowNowIds], belowNowIds, matched, skillMatchRate: Math.round((matched / total) * 100),
    recsOpen, recsCompleted,
    predicted: { targetDate: addD(date, 30), chargeability: pc, riskIds: pr },
    demo: true,
  }));
}
