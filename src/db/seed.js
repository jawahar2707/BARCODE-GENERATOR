/**
 * Standalone seed script: node src/db/seed.js
 * Also invoked from server on empty templates table.
 */
const path = require('path');
const db = require('./database');

const SAMPLE_LAYOUT = {
  barcode: {
    x_mm: 7,
    y_mm: 2,
    width_mm: 40,
    height_mm: 9,
    type: 'code128',
    sourceField: 'barcode_value'
  },
  blocks: [
    {
      type: 'text',
      field: 'sku',
      x_mm: 27,
      y_mm: 12,
      fontSizePt: 6,
      align: 'center',
      maxWidth_mm: 50
    },
    {
      type: 'text',
      field: 'size',
      x_mm: 48,
      y_mm: 6,
      fontSizePt: 7,
      align: 'right'
    }
  ],
  sheet: { cols: 1, rows: 1, hGap_mm: 2, vGap_mm: 2 }
};

const defaults = [
  ['default_paper', 'A4'],
  ['margin_top_mm', '10'],
  ['margin_left_mm', '10'],
  ['barcode_default_scale', '1'],
  ['backup_export_path', path.join(__dirname, '..', '..', 'exports')]
];

function seed() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM templates').get().c;
  if (count > 0) {
    console.log('Templates already exist; skip template seed.');
  } else {
    db.prepare(
      `INSERT INTO templates (template_name, width_mm, height_mm, barcode_type, layout_json)
       VALUES (?, ?, ?, ?, ?)`
    ).run(
      'Retail 54x20mm - SKU + Size',
      54,
      20,
      'code128',
      JSON.stringify(SAMPLE_LAYOUT)
    );
    console.log('Seeded sample template: 54mm × 20mm');
  }

  const ins = db.prepare(
    'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
  );
  for (const [k, v] of defaults) {
    ins.run(k, v);
  }
}

seed();
module.exports = { SAMPLE_LAYOUT };
