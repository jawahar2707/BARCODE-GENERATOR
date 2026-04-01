const db = require('../db/database');
const path = require('path');

function getAll() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const out = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}

function get(key, fallback) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

function set(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
    key,
    String(value)
  );
}

function setMany(pairs) {
  const stmt = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );
  db.runTransaction(() => {
    for (const [k, v] of Object.entries(pairs)) {
      stmt.run(k, String(v));
    }
  });
}

function resolveExportDir() {
  const custom = get('backup_export_path', '');
  if (custom && String(custom).trim()) {
    return path.resolve(String(custom).trim());
  }
  return path.join(__dirname, '..', '..', 'exports');
}

module.exports = { getAll, get, set, setMany, resolveExportDir };
