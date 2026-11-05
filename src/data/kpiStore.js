/**
 * KPI persistence — follows the app's existing pattern (browser localStorage, "ruo_" prefix,
 * fail-silently on quota errors) plus a JSON bundle for export/import.
 * The storage object is injectable so the module can be tested without a browser.
 */
import { DEFAULT_CONFIG, validateConfig, validateForecastRows, validateEventRows } from "../engine/kpi.js";

export const KEYS = {
  config: "ruo_kpi_config",
  forecast: "ruo_kpi_forecast",
  events: "ruo_kpi_events",
  history: "ruo_kpi_history",
  recStates: "ruo_kpi_rec_states",
};
export const BUNDLE_VERSION = 1;
export const MAX_HISTORY = 400;

function getStorage(s) {
  if (s) return s;
  try { return typeof localStorage !== "undefined" ? localStorage : null; } catch { return null; }
}
function read(st, key, fallback) {
  try {
    const raw = st && st.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}
function write(st, key, value) {
  try { if (st) st.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

/** True if the user has ever saved KPI state (so first-run sample seeding is skipped). */
export function hasSavedState(storage) {
  const st = getStorage(storage);
  return !!(st && Object.values(KEYS).some(k => st.getItem(k)));
}

export function loadState(storage) {
  const st = getStorage(storage);
  const cfg = validateConfig(read(st, KEYS.config, DEFAULT_CONFIG)).config;
  const arr = (k) => { const v = read(st, k, []); return Array.isArray(v) ? v : []; };
  const rs = read(st, KEYS.recStates, {});
  return {
    config: cfg,
    forecast: arr(KEYS.forecast),
    events: arr(KEYS.events),
    history: arr(KEYS.history),
    recStates: rs && typeof rs === "object" && !Array.isArray(rs) ? rs : {},
  };
}

export function saveConfig(config, storage) { return write(getStorage(storage), KEYS.config, config); }
export function saveForecast(rows, storage) { return write(getStorage(storage), KEYS.forecast, rows); }
export function saveEvents(rows, storage) { return write(getStorage(storage), KEYS.events, rows); }
export function saveRecStates(states, storage) { return write(getStorage(storage), KEYS.recStates, states); }
export function saveHistory(history, storage) { return write(getStorage(storage), KEYS.history, history.slice(-MAX_HISTORY)); }

/** Insert or replace the snapshot for a given date (one per day). Returns the new history. */
export function upsertSnapshot(history, snapshot) {
  const out = history.filter(s => s.date !== snapshot.date);
  out.push(snapshot);
  return out.sort((a, b) => a.date.localeCompare(b.date)).slice(-MAX_HISTORY);
}

export function clearAll(storage) {
  const st = getStorage(storage);
  if (st) Object.values(KEYS).forEach(k => { try { st.removeItem(k); } catch { /* ignore */ } });
}

export function exportBundle(state) {
  return JSON.stringify({ app: "ruo-kpi", version: BUNDLE_VERSION, exportedAt: new Date().toISOString(), ...state }, null, 2);
}

/** Parse and re-validate an exported bundle. Returns { ok, state, errors }. */
export function importBundle(text, knownIds) {
  let obj;
  try { obj = JSON.parse(text); } catch { return { ok: false, errors: ["File is not valid JSON."] }; }
  if (!obj || obj.app !== "ruo-kpi") return { ok: false, errors: ["File is not a KPI bundle exported from this tool."] };
  if (obj.version !== BUNDLE_VERSION) return { ok: false, errors: [`Unsupported bundle version ${obj.version}.`] };
  const errors = [];
  const cfg = validateConfig(obj.config);
  cfg.errors.forEach(e => errors.push(`Config: ${e}`));
  const f = validateForecastRows(Array.isArray(obj.forecast) ? obj.forecast : []);
  f.errors.forEach(e => errors.push(`Forecast line ${e.line}: ${e.message}`));
  const ev = validateEventRows(Array.isArray(obj.events) ? obj.events : [], knownIds);
  ev.errors.forEach(e => errors.push(`Event line ${e.line}: ${e.message}`));
  const history = Array.isArray(obj.history) ? obj.history.filter(s => s && typeof s.date === "string" && typeof s.chargeability === "number") : [];
  const recStates = obj.recStates && typeof obj.recStates === "object" && !Array.isArray(obj.recStates) ? obj.recStates : {};
  return { ok: true, errors, state: { config: cfg.config, forecast: f.valid, events: ev.valid, history, recStates } };
}
