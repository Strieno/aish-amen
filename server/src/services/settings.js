import { get, run } from '../db/index.js';
import { parseJson } from '../lib/util.js';

export function getSetting(key) {
  const row = get('SELECT value FROM settings WHERE key = ?', key);
  return row ? parseJson(row.value, null) : null;
}

export function setSetting(key, value) {
  const raw = typeof value === 'string' ? value : JSON.stringify(value);
  run(
    `INSERT INTO settings(key, value) VALUES (?,?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    key,
    raw,
  );
}

// A boolean-ish setting read as JSON-safe boolean.
export function getSettingBool(key, fallback = false) {
  const v = getSetting(key);
  if (v === null || v === undefined) return fallback;
  return String(v) === 'true' || v === true;
}

// Merge a nested settings object (e.g. settings.ai) with a patch.
export function patchSetting(key, patch) {
  const current = getSetting(key) || {};
  const next = { ...current, ...patch };
  setSetting(key, next);
  return next;
}
