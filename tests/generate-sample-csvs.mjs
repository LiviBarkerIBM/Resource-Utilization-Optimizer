// One-off generator: writes the sample CSVs from the validated sample data so they cannot drift.
import { writeFileSync } from "node:fs";
import { sampleForecast, sampleEvents } from "../src/data/kpiSamples.js";
import { validateForecastRows, validateEventRows } from "../src/engine/kpi.js";

const q = v => { const s = Array.isArray(v) ? v.join(",") : String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const csv = (cols, rows) => [cols.join(","), ...rows.map(r => cols.map(c => q(r[c])).join(","))].join("\n") + "\n";
const fc = ["id", "roleTitle", "client", "jrs", "skills", "niceToHaveSkills", "bandMin", "bandMax", "startDate", "endDate", "hoursPerWeek", "probability", "location", "travelRequired", "notes"];
const ec = ["id", "type", "date", "endDate", "label", "consultantId", "hoursDelta"];
const root = new URL("../", import.meta.url);
writeFileSync(new URL("sample_demand_forecast.csv", root), csv(fc, sampleForecast()));
writeFileSync(new URL("sample_future_events.csv", root), csv(ec, sampleEvents()));
console.log("forecast errors:", validateForecastRows(sampleForecast()).errors.length, "event errors:", validateEventRows(sampleEvents()).errors.length);
