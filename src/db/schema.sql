-- Local Label Studio — SQLite schema (offline only)

CREATE TABLE IF NOT EXISTS templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_name TEXT NOT NULL,
  width_mm REAL NOT NULL,
  height_mm REAL NOT NULL,
  barcode_type TEXT NOT NULL DEFAULT 'code128',
  layout_json TEXT NOT NULL,
  background_image_path TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS label_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  template_id INTEGER NOT NULL REFERENCES templates(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS label_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL REFERENCES label_batches(id) ON DELETE CASCADE,
  sku TEXT,
  barcode_value TEXT NOT NULL,
  item_name TEXT,
  size TEXT,
  color TEXT,
  mrp TEXT,
  qty INTEGER NOT NULL DEFAULT 1,
  extra_data_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_label_items_batch ON label_items(batch_id);
CREATE INDEX IF NOT EXISTS idx_batches_template ON label_batches(template_id);
