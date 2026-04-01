const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const dataDir = path.join(__dirname, '..', '..', 'data');
const dbPath = path.join(dataDir, 'app.db');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new DatabaseSync(dbPath);

try {
  db.exec('PRAGMA journal_mode = WAL;');
} catch {
  /* ignore if unsupported */
}
db.exec('PRAGMA foreign_keys = ON;');

const schemaPath = path.join(__dirname, 'schema.sql');
const schema = fs.readFileSync(schemaPath, 'utf8');
db.exec(schema);

function tableHasColumn(table, col) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col);
}

if (!tableHasColumn('label_batches', 'page_template_id')) {
  db.exec('ALTER TABLE label_batches ADD COLUMN page_template_id INTEGER REFERENCES page_templates(id)');
}
if (!tableHasColumn('label_batches', 'page_metadata_json')) {
  db.exec('ALTER TABLE label_batches ADD COLUMN page_metadata_json TEXT');
}

try {
  db.exec('CREATE INDEX IF NOT EXISTS idx_batches_page ON label_batches(page_template_id)');
} catch {
  /* ignore */
}

/**
 * Run callback inside a transaction (replaces better-sqlite3 db.transaction).
 */
function runTransaction(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    fn();
    db.exec('COMMIT');
  } catch (e) {
    try {
      db.exec('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw e;
  }
}

db.runTransaction = runTransaction;

module.exports = db;
