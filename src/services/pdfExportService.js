const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { mmToPt, getPaperSizeMm } = require('../utils/units');
const { renderPngBuffer } = require('./barcodeService');
const settingsService = require('./settingsService');

function itemExtras(item) {
  if (!item.extra_data_json) return {};
  try {
    return JSON.parse(item.extra_data_json);
  } catch {
    return {};
  }
}

function getFieldValue(item, field) {
  const extras = itemExtras(item);
  const f = String(field || '').toLowerCase();
  const map = {
    sku: item.sku,
    barcode_value: item.barcode_value,
    item_name: item.item_name,
    size: item.size,
    color: item.color,
    mrp: item.mrp
  };
  if (map[f] != null && map[f] !== '') return String(map[f]);
  if (extras[f] != null) return String(extras[f]);
  if (extras[field] != null) return String(extras[field]);
  return '';
}

function flattenItems(items) {
  const out = [];
  for (const it of items) {
    const n = Math.max(1, Math.min(9999, parseInt(it.qty, 10) || 1));
    for (let i = 0; i < n; i++) out.push(it);
  }
  return out;
}

/**
 * Draw one label (mm layout) with origin at bottom-left of label cell (PDF pt).
 */
async function drawLabel(
  pdfDoc,
  page,
  originX,
  originY,
  labelWmm,
  labelHmm,
  layout,
  templateBarcodeType,
  item,
  font
) {
  const labelWpt = mmToPt(labelWmm);
  const labelHpt = mmToPt(labelHmm);

  page.drawRectangle({
    x: originX,
    y: originY,
    width: labelWpt,
    height: labelHpt,
    borderColor: rgb(0.85, 0.85, 0.85),
    borderWidth: 0.25,
    color: rgb(1, 1, 1)
  });

  const bc = layout.barcode || {};
  const sourceField = bc.sourceField || 'barcode_value';
  const rawForBarcode = getFieldValue(item, sourceField) || item.barcode_value;
  const bcType = bc.type || templateBarcodeType || 'code128';

  const bx = Number(bc.x_mm) || 0;
  const by = Number(bc.y_mm) || 0;
  const bwMm = Number(bc.width_mm) || 30;
  const bhMm = Number(bc.height_mm) || 10;

  try {
    const png = await renderPngBuffer(bcType, rawForBarcode, { scale: 3 });
    const img = await pdfDoc.embedPng(png);
    const targetW = mmToPt(bwMm);
    const targetH = mmToPt(bhMm);
    const imgY = originY + mmToPt(labelHmm - by - bhMm);
    const imgX = originX + mmToPt(bx);
    page.drawImage(img, {
      x: imgX,
      y: imgY,
      width: targetW,
      height: targetH
    });
  } catch (e) {
    const msg = (e && e.message) || 'Barcode error';
    page.drawText(`[${msg.slice(0, 40)}]`, {
      x: originX + mmToPt(bx),
      y: originY + mmToPt(labelHmm - by - 4),
      size: 5,
      font,
      color: rgb(0.8, 0, 0)
    });
  }

  const blocks = Array.isArray(layout.blocks) ? layout.blocks : [];
  for (const block of blocks) {
    if (block.type !== 'text') continue;
    const text = getFieldValue(item, block.field);
    if (!text) continue;
    const tx = Number(block.x_mm) || 0;
    const ty = Number(block.y_mm) || 0;
    const size = Math.max(4, Math.min(24, Number(block.fontSizePt) || 7));
    const align = block.align || 'left';
    const maxWmm = block.maxWidth_mm != null ? Number(block.maxWidth_mm) : labelWmm;

    let drawX = originX + mmToPt(tx);
    const textW = font.widthOfTextAtSize(text, size);
    const maxWpt = mmToPt(maxWmm);
    if (align === 'center') {
      drawX = originX + mmToPt(tx) - textW / 2;
    } else if (align === 'right') {
      drawX = originX + mmToPt(tx) - textW;
    }

    const baselineY = originY + mmToPt(labelHmm - ty) - size * 0.8;

    page.drawText(text, {
      x: drawX,
      y: baselineY,
      size,
      font,
      color: rgb(0, 0, 0),
      maxWidth: Math.min(textW + 2, maxWpt)
    });
  }
}

async function buildPdfForBatch(templateRow, items, settings) {
  const layout = templateRow.layout || JSON.parse(templateRow.layout_json || '{}');
  const sheet = layout.sheet || { cols: 1, rows: 1, hGap_mm: 2, vGap_mm: 2 };
  const cols = Math.max(1, Math.min(20, parseInt(sheet.cols, 10) || 1));
  const rows = Math.max(1, Math.min(50, parseInt(sheet.rows, 10) || 1));
  const hGap = Number(sheet.hGap_mm) || 0;
  const vGap = Number(sheet.vGap_mm) || 0;

  const paperName = settings.default_paper || 'A4';
  const { width: paperWmm, height: paperHmm } = getPaperSizeMm(paperName);
  const marginTop = Number(settings.margin_top_mm) || 10;
  const marginLeft = Number(settings.margin_left_mm) || 10;

  const labelWmm = Number(templateRow.width_mm);
  const labelHmm = Number(templateRow.height_mm);
  const perPage = cols * rows;
  const flat = flattenItems(items);

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const pageWpt = mmToPt(paperWmm);
  const pageHpt = mmToPt(paperHmm);

  let idx = 0;
  while (idx < flat.length) {
    const page = pdfDoc.addPage([pageWpt, pageHpt]);

    for (let slot = 0; slot < perPage && idx < flat.length; slot++) {
      const col = slot % cols;
      const row = Math.floor(slot / cols);

      const cellLeftMm = marginLeft + col * (labelWmm + hGap);
      const cellTopMm = marginTop + row * (labelHmm + vGap);

      const originX = mmToPt(cellLeftMm);
      const originY = pageHpt - mmToPt(cellTopMm) - mmToPt(labelHmm);

      await drawLabel(
        pdfDoc,
        page,
        originX,
        originY,
        labelWmm,
        labelHmm,
        layout,
        templateRow.barcode_type,
        flat[idx],
        font
      );
      idx++;
    }
  }

  if (flat.length === 0) {
    const page = pdfDoc.addPage([pageWpt, pageHpt]);
    page.drawText('No label items to export.', { x: 50, y: pageHpt - 80, size: 12, font });
  }

  return pdfDoc.save();
}

async function exportBatchToBuffer(batch) {
  const templateService = require('./templateService');
  const template = templateService.getTemplate(batch.template_id);
  if (!template) {
    const e = new Error('Template not found');
    e.code = 'NOT_FOUND';
    throw e;
  }

  const settings = settingsService.getAll();
  const bytes = await buildPdfForBatch(template, batch.items || [], settings);
  return Buffer.from(bytes);
}

/** One label on one page — print-accurate preview */
async function buildPreviewPdf(templateRow, item) {
  const settings = settingsService.getAll();
  const layout = templateRow.layout || JSON.parse(templateRow.layout_json || '{}');
  const patchedLayout = {
    ...layout,
    sheet: { cols: 1, rows: 1, hGap_mm: 0, vGap_mm: 0 }
  };
  const tr = { ...templateRow, layout: patchedLayout };
  const sample = {
    sku: 'PNC533611M',
    barcode_value: 'PNC533611M',
    item_name: 'Sample item',
    size: 'M',
    color: '',
    mrp: '',
    qty: 1,
    ...item
  };
  const bytes = await buildPdfForBatch(tr, [sample], settings);
  return Buffer.from(bytes);
}

module.exports = {
  buildPdfForBatch,
  exportBatchToBuffer,
  buildPreviewPdf,
  getFieldValue,
  flattenItems,
  drawLabel
};
