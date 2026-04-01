const db = require('../db/database');

function createBatch(name, templateId) {
  const tid = Number(templateId);
  if (!name || !tid) {
    const e = new Error('name and template_id required');
    e.code = 'VALIDATION';
    throw e;
  }
  const r = db
    .prepare('INSERT INTO label_batches (name, template_id) VALUES (?, ?)')
    .run(name, tid);
  return getBatch(r.lastInsertRowid);
}

function getBatch(id) {
  const batch = db
    .prepare(
      `SELECT b.id, b.name, b.template_id, b.created_at,
              t.template_name, t.width_mm, t.height_mm, t.barcode_type
       FROM label_batches b
       JOIN templates t ON t.id = b.template_id
       WHERE b.id = ?`
    )
    .get(id);
  if (!batch) return null;
  const items = db
    .prepare(
      `SELECT id, batch_id, sku, barcode_value, item_name, size, color, mrp, qty, extra_data_json
       FROM label_items WHERE batch_id = ? ORDER BY id`
    )
    .all(id);
  return { ...batch, items };
}

function listBatches(limit = 100) {
  return db
    .prepare(
      `SELECT b.id, b.name, b.template_id, b.created_at,
              t.template_name,
              (SELECT COUNT(*) FROM label_items i WHERE i.batch_id = b.id) AS item_count
       FROM label_batches b
       JOIN templates t ON t.id = b.template_id
       ORDER BY b.created_at DESC
       LIMIT ?`
    )
    .all(limit);
}

function addItems(batchId, items) {
  const ins = db.prepare(
    `INSERT INTO label_items (batch_id, sku, barcode_value, item_name, size, color, mrp, qty, extra_data_json)
     VALUES (?,?,?,?,?,?,?,?,?)`
  );
  db.runTransaction(() => {
    for (const row of items) {
      const qty = Math.max(1, Math.min(9999, parseInt(row.qty, 10) || 1));
      ins.run(
        batchId,
        row.sku ?? '',
        String(row.barcode_value ?? '').trim(),
        row.item_name ?? '',
        row.size ?? '',
        row.color ?? '',
        row.mrp != null ? String(row.mrp) : '',
        qty,
        row.extra_data_json ? String(row.extra_data_json) : null
      );
    }
  });
  return getBatch(batchId);
}

function clearItems(batchId) {
  db.prepare('DELETE FROM label_items WHERE batch_id = ?').run(batchId);
}

function deleteBatch(id) {
  db.prepare('DELETE FROM label_items WHERE batch_id = ?').run(id);
  db.prepare('DELETE FROM label_batches WHERE id = ?').run(id);
  return { ok: true };
}

module.exports = {
  createBatch,
  getBatch,
  listBatches,
  addItems,
  clearItems,
  deleteBatch
};
