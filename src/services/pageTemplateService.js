const db = require('../db/database');

function parseJson(str, fallback) {
  if (str == null || str === '') return fallback;
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

function hydrate(row) {
  if (!row) return null;
  return {
    ...row,
    header_regions: parseJson(row.header_regions_json, []),
    label_grid: parseJson(row.label_grid_json, {}),
    dynamic_fields: parseJson(row.dynamic_fields_json, [])
  };
}

function listPageTemplates() {
  const rows = db
    .prepare(
      `SELECT id, name, page_width_mm, page_height_mm, background_image_path,
              header_regions_json, label_grid_json, dynamic_fields_json, created_at, updated_at
       FROM page_templates ORDER BY updated_at DESC`
    )
    .all();
  return rows.map(hydrate);
}

function getPageTemplate(id) {
  const row = db
    .prepare(
      `SELECT id, name, page_width_mm, page_height_mm, background_image_path,
              header_regions_json, label_grid_json, dynamic_fields_json, created_at, updated_at
       FROM page_templates WHERE id = ?`
    )
    .get(id);
  return hydrate(row);
}

const PRESET_TAFEETA = {
  header_regions: [
    { key: 'buyer', x_mm: 125, y_mm: 16, fontSizePt: 9, align: 'left' },
    { key: 'date', x_mm: 172, y_mm: 10, fontSizePt: 9, align: 'left' },
    { key: 'po_no', x_mm: 172, y_mm: 18, fontSizePt: 9, align: 'left' },
    { key: 'style_number', x_mm: 172, y_mm: 26, fontSizePt: 9, align: 'left' }
  ],
  label_grid: {
    origin_x_mm: 6,
    origin_y_mm: 40,
    cols: 5,
    rows: 6,
    cell_width_mm: 39,
    cell_height_mm: 36,
    h_gap_mm: 2,
    v_gap_mm: 2
  },
  dynamic_fields: [
    { key: 'buyer', label: 'Buyer', type: 'text', section: 'page' },
    { key: 'date', label: 'Date (leave empty for today)', type: 'text', section: 'page' },
    { key: 'po_no', label: 'PO No', type: 'text', section: 'page' },
    { key: 'style_number', label: 'Style number', type: 'text', section: 'page' }
  ]
};

function savePageTemplate(data) {
  const {
    id,
    name,
    page_width_mm,
    page_height_mm,
    background_image_path,
    header_regions,
    label_grid,
    dynamic_fields
  } = data;

  if (!name || String(name).trim() === '') {
    const e = new Error('name required');
    e.code = 'VALIDATION';
    throw e;
  }

  const header_regions_json = JSON.stringify(header_regions || []);
  const label_grid_json = JSON.stringify(label_grid || {});
  const dynamic_fields_json = JSON.stringify(dynamic_fields || []);
  const pw = Number(page_width_mm) || 210;
  const ph = Number(page_height_mm) || 297;

  if (id) {
    db.prepare(
      `UPDATE page_templates SET name=?, page_width_mm=?, page_height_mm=?, background_image_path=?,
        header_regions_json=?, label_grid_json=?, dynamic_fields_json=?, updated_at=datetime('now') WHERE id=?`
    ).run(
      name.trim(),
      pw,
      ph,
      background_image_path || null,
      header_regions_json,
      label_grid_json,
      dynamic_fields_json,
      id
    );
    return getPageTemplate(id);
  }

  const r = db
    .prepare(
      `INSERT INTO page_templates (name, page_width_mm, page_height_mm, background_image_path,
        header_regions_json, label_grid_json, dynamic_fields_json)
       VALUES (?,?,?,?,?,?,?)`
    )
    .run(
      name.trim(),
      pw,
      ph,
      background_image_path || null,
      header_regions_json,
      label_grid_json,
      dynamic_fields_json
    );
  return getPageTemplate(r.lastInsertRowid);
}

function deletePageTemplate(id) {
  const n = db.prepare('SELECT COUNT(*) AS c FROM label_batches WHERE page_template_id = ?').get(id).c;
  if (n > 0) {
    const e = new Error('Page layout is used by batches; remove it from those batches first.');
    e.code = 'IN_USE';
    throw e;
  }
  db.prepare('DELETE FROM page_templates WHERE id = ?').run(id);
  return { ok: true };
}

module.exports = {
  listPageTemplates,
  getPageTemplate,
  savePageTemplate,
  deletePageTemplate,
  PRESET_TAFEETA
};
