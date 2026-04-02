const { parse } = require('csv-parse/sync');

const KNOWN = [
  'sku',
  'barcode_value',
  'barcode',
  'item_name',
  'name',
  'size',
  'color',
  'mrp',
  'qty',
  'quantity'
];

function normalizeHeader(h) {
  return String(h || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function mapRow(record, barcodeField) {
  const lower = {};
  for (const [k, v] of Object.entries(record)) {
    lower[normalizeHeader(k)] = v;
  }

  const sku = lower.sku ?? '';
  const barcodeKey = normalizeHeader(barcodeField || 'barcode_value');
  const barcodeRaw =
    lower[barcodeKey] ??
    lower.barcode_value ??
    lower.barcode ??
    lower.upc ??
    lower.ean ??
    '';

  const item_name = lower.item_name ?? lower.name ?? lower.product ?? '';
  const size = lower.size ?? '';
  const color = lower.color ?? '';
  const mrp = lower.mrp ?? lower.price ?? '';
  const qty = lower.qty ?? lower.quantity ?? '1';
  const vendor_code = lower.vendor_code ?? lower.vendor ?? lower.vendorcode ?? '';

  return {
    sku: String(sku).trim(),
    barcode_value: String(barcodeRaw).trim(),
    item_name: String(item_name).trim(),
    size: String(size).trim(),
    color: String(color).trim(),
    mrp: String(mrp).trim(),
    qty: parseInt(qty, 10) || 1,
    vendor_code: String(vendor_code).trim()
  };
}

function parseCsvBuffer(buffer, options = {}) {
  const text = buffer.toString('utf8');
  let records;
  try {
    records = parse(text, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true
    });
  } catch (e) {
    const err = new Error(`CSV parse failed: ${e.message}`);
    err.code = 'CSV_PARSE';
    throw err;
  }

  if (!Array.isArray(records) || records.length === 0) {
    const err = new Error('CSV has no data rows');
    err.code = 'CSV_EMPTY';
    throw err;
  }

  const barcodeField = options.barcodeColumn || 'barcode_value';
  const rows = [];
  const errors = [];

  records.forEach((rec, idx) => {
    try {
      const row = mapRow(rec, barcodeField);
      if (!row.barcode_value) {
        errors.push({ line: idx + 2, message: 'Missing barcode value' });
        return;
      }
      rows.push(row);
    } catch (e) {
      errors.push({ line: idx + 2, message: e.message });
    }
  });

  return { rows, errors, headers: Object.keys(records[0] || {}) };
}

module.exports = { parseCsvBuffer, normalizeHeader, KNOWN };
