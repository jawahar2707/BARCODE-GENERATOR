const db = require('../db/database');

function parseLayout(row) {
  if (!row) return null;
  let layout;
  try {
    layout = JSON.parse(row.layout_json);
  } catch {
    layout = { barcode: {}, blocks: [], sheet: { cols: 1, rows: 1, hGap_mm: 2, vGap_mm: 2 } };
  }
  return { ...row, layout };
}

function listTemplates() {
  const rows = db
    .prepare(
      `SELECT id, template_name, width_mm, height_mm, barcode_type, layout_json,
              background_image_path, created_at, updated_at
       FROM templates ORDER BY updated_at DESC`
    )
    .all();
  return rows.map(parseLayout);
}

function getTemplate(id) {
  const row = db
    .prepare(
      `SELECT id, template_name, width_mm, height_mm, barcode_type, layout_json,
              background_image_path, created_at, updated_at
       FROM templates WHERE id = ?`
    )
    .get(id);
  return parseLayout(row);
}

function defaultLayout() {
  return {
    border: { enabled: true, width_pt: 1, color: '#000000', inset_mm: 0.3 },
    barcode: {
      x_mm: 5,
      y_mm: 3,
      width_mm: 30,
      height_mm: 10,
      type: 'code128',
      sourceField: 'barcode_value'
    },
    blocks: [
      {
        type: 'text',
        field: 'sku',
        x_mm: 5,
        y_mm: 14,
        fontSizePt: 7,
        align: 'left'
      }
    ],
    sheet: { cols: 2, rows: 5, hGap_mm: 3, vGap_mm: 3 }
  };
}

function saveTemplate(data) {
  const {
    id,
    template_name,
    width_mm,
    height_mm,
    barcode_type,
    layout,
    background_image_path
  } = data;

  const layout_json = JSON.stringify(layout || defaultLayout());
  const w = Number(width_mm);
  const h = Number(height_mm);
  if (!template_name || !w || !h) {
    const e = new Error('template_name, width_mm, height_mm required');
    e.code = 'VALIDATION';
    throw e;
  }

  if (id) {
    db.prepare(
      `UPDATE templates SET template_name=?, width_mm=?, height_mm=?, barcode_type=?,
        layout_json=?, background_image_path=?, updated_at=datetime('now') WHERE id=?`
    ).run(
      template_name,
      w,
      h,
      barcode_type || 'code128',
      layout_json,
      background_image_path || null,
      id
    );
    return getTemplate(id);
  }

  const r = db
    .prepare(
      `INSERT INTO templates (template_name, width_mm, height_mm, barcode_type, layout_json, background_image_path)
       VALUES (?,?,?,?,?,?)`
    ).run(
      template_name,
      w,
      h,
      barcode_type || 'code128',
      layout_json,
      background_image_path || null
    );
  return getTemplate(r.lastInsertRowid);
}

function deleteTemplate(id) {
  const batchCount = db.prepare('SELECT COUNT(*) AS c FROM label_batches WHERE template_id = ?').get(id).c;
  if (batchCount > 0) {
    const e = new Error('Template is used by saved batches; delete batches first or keep template.');
    e.code = 'IN_USE';
    throw e;
  }
  db.prepare('DELETE FROM templates WHERE id = ?').run(id);
  return { ok: true };
}

module.exports = {
  listTemplates,
  getTemplate,
  saveTemplate,
  deleteTemplate,
  defaultLayout
};
