const db = require('../db/database');
const pageTemplateService = require('./pageTemplateService');

function parseMeta(str) {
  if (!str) return {};
  try {
    return JSON.parse(str);
  } catch {
    return {};
  }
}

function createBatch(name, templateId, options = {}) {
  const tid = Number(templateId);
  if (!name || !tid) {
    const e = new Error('name and template_id required');
    e.code = 'VALIDATION';
    throw e;
  }
  const ptid =
    options.page_template_id != null && options.page_template_id !== ''
      ? Number(options.page_template_id)
      : null;
  const metaStr =
    options.page_metadata && typeof options.page_metadata === 'object'
      ? JSON.stringify(options.page_metadata)
      : null;

  const r = db
    .prepare(
      `INSERT INTO label_batches (name, template_id, page_template_id, page_metadata_json)
       VALUES (?,?,?,?)`
    )
    .run(name, tid, ptid, metaStr);
  return getBatch(r.lastInsertRowid);
}

function getBatch(id) {
  const batch = db
    .prepare(
      `SELECT b.id, b.name, b.template_id, b.page_template_id, b.page_metadata_json, b.created_at,
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

  const page_metadata = parseMeta(batch.page_metadata_json);
  let page_template = null;
  if (batch.page_template_id) {
    page_template = pageTemplateService.getPageTemplate(batch.page_template_id);
  }

  return {
    id: batch.id,
    name: batch.name,
    template_id: batch.template_id,
    template_name: batch.template_name,
    width_mm: batch.width_mm,
    height_mm: batch.height_mm,
    barcode_type: batch.barcode_type,
    page_template_id: batch.page_template_id,
    page_metadata,
    page_template,
    created_at: batch.created_at,
    items
  };
}

function updateBatch(id, patch) {
  const existing = db.prepare('SELECT * FROM label_batches WHERE id = ?').get(id);
  if (!existing) return null;

  const name = patch.name !== undefined ? String(patch.name).trim() || existing.name : existing.name;
  let page_template_id = existing.page_template_id;
  if (patch.page_template_id !== undefined) {
    page_template_id =
      patch.page_template_id === null || patch.page_template_id === ''
        ? null
        : Number(patch.page_template_id);
  }
  let page_metadata_json = existing.page_metadata_json;
  if (patch.page_metadata !== undefined) {
    page_metadata_json =
      patch.page_metadata && typeof patch.page_metadata === 'object'
        ? JSON.stringify(patch.page_metadata)
        : null;
  }

  db.prepare(
    `UPDATE label_batches SET name=?, page_template_id=?, page_metadata_json=? WHERE id=?`
  ).run(name, page_template_id, page_metadata_json, id);
  return getBatch(id);
}

function listBatches(limit = 100) {
  return db
    .prepare(
      `SELECT b.id, b.name, b.template_id, b.page_template_id, b.created_at,
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
  updateBatch,
  listBatches,
  addItems,
  clearItems,
  deleteBatch
};
