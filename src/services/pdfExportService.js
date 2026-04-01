const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb, degrees } = require('pdf-lib');
const { mmToPt, getPaperSizeMm } = require('../utils/units');
const { renderPngBuffer } = require('./barcodeService');
const settingsService = require('./settingsService');

const ROOT = path.join(__dirname, '..', '..');

function absProjectPath(rel) {
  if (!rel) return null;
  const p = path.join(ROOT, String(rel).replace(/\//g, path.sep));
  return fs.existsSync(p) ? p : null;
}

function hexToRgbColor(hex) {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(String(hex || '').trim());
  if (!m) return rgb(0, 0, 0);
  const n = parseInt(m[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function labelMmToPdfPoint(originX, originY, labelHmm, xMm, yMmFromTop) {
  return {
    x: originX + mmToPt(xMm),
    y: originY + mmToPt(labelHmm - yMmFromTop)
  };
}

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

function resolveHeaderValue(key, meta) {
  const k = String(key || '');
  const raw = meta[k];
  if (raw != null && String(raw).trim() !== '') return String(raw);
  const lower = k.toLowerCase();
  if (lower === 'date' || lower === 'today') {
    const d = new Date();
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${d.getFullYear()}`;
  }
  return '';
}

function scaleLayout(layout, factor) {
  const s = factor;
  const bc = layout.barcode || {};
  const border = layout.border
    ? {
        ...layout.border,
        inset_mm: (Number(layout.border.inset_mm) || 0) * s
      }
    : undefined;

  const blocks = Array.isArray(layout.blocks)
    ? layout.blocks.map((b) => {
        if (b.type === 'line') {
          return {
            ...b,
            x1_mm: (Number(b.x1_mm) || 0) * s,
            y1_mm: (Number(b.y1_mm) || 0) * s,
            x2_mm: (Number(b.x2_mm) || 0) * s,
            y2_mm: (Number(b.y2_mm) || 0) * s,
            thickness: b.thickness != null ? Number(b.thickness) * s : undefined
          };
        }
        if (b.type === 'image') {
          return {
            ...b,
            x_mm: (Number(b.x_mm) || 0) * s,
            y_mm: (Number(b.y_mm) || 0) * s,
            width_mm: (Number(b.width_mm) || 8) * s,
            height_mm: (Number(b.height_mm) || 8) * s
          };
        }
        return {
          ...b,
          x_mm: (Number(b.x_mm) || 0) * s,
          y_mm: (Number(b.y_mm) || 0) * s,
          fontSizePt: Math.max(3, (Number(b.fontSizePt) || 7) * s),
          maxWidth_mm: b.maxWidth_mm != null ? Number(b.maxWidth_mm) * s : undefined
        };
      })
    : [];
  return {
    ...layout,
    border,
    barcode: {
      ...bc,
      x_mm: (Number(bc.x_mm) || 0) * s,
      y_mm: (Number(bc.y_mm) || 0) * s,
      width_mm: (Number(bc.width_mm) || 30) * s,
      height_mm: (Number(bc.height_mm) || 10) * s
    },
    blocks
  };
}

function drawLayoutBorder(page, layout, originX, originY, labelWmm, labelHmm) {
  const b = layout.border;
  if (!b || !b.enabled) return;
  const insetPt = mmToPt(Number(b.inset_mm) || 0);
  const wpt = mmToPt(labelWmm) - 2 * insetPt;
  const hpt = mmToPt(labelHmm) - 2 * insetPt;
  if (wpt <= 0 || hpt <= 0) return;
  const widthPt = Math.max(0.25, Number(b.width_pt) || 1);
  page.drawRectangle({
    x: originX + insetPt,
    y: originY + insetPt,
    width: wpt,
    height: hpt,
    borderColor: hexToRgbColor(b.color),
    borderWidth: widthPt
  });
}

/**
 * Draw one label (mm layout) with origin at bottom-left of label cell (PDF pt).
 * options.skipCellBackground: true when drawing on top of a page template image.
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
  font,
  options = {}
) {
  const skipCellBackground = options.skipCellBackground === true;
  const labelWpt = mmToPt(labelWmm);
  const labelHpt = mmToPt(labelHmm);

  if (!skipCellBackground) {
    page.drawRectangle({
      x: originX,
      y: originY,
      width: labelWpt,
      height: labelHpt,
      color: rgb(1, 1, 1)
    });
    if (!layout.border || !layout.border.enabled) {
      page.drawRectangle({
        x: originX,
        y: originY,
        width: labelWpt,
        height: labelHpt,
        borderColor: rgb(0.85, 0.85, 0.85),
        borderWidth: 0.25
      });
    }
  }

  const blocks = Array.isArray(layout.blocks) ? layout.blocks : [];
  for (const block of blocks) {
    if (block.type === 'line') {
      const t = Number(block.thickness) || 0.35;
      const p1 = labelMmToPdfPoint(originX, originY, labelHmm, Number(block.x1_mm) || 0, Number(block.y1_mm) || 0);
      const p2 = labelMmToPdfPoint(originX, originY, labelHmm, Number(block.x2_mm) || 0, Number(block.y2_mm) || 0);
      const dash = Array.isArray(block.dash) ? block.dash.map(Number).filter((n) => !Number.isNaN(n)) : undefined;
      page.drawLine({
        start: p1,
        end: p2,
        thickness: Math.max(0.1, t),
        color: hexToRgbColor(block.color || '#000000'),
        dashArray: dash && dash.length ? dash : undefined,
        dashPhase: block.dashPhase != null ? Number(block.dashPhase) : undefined
      });
    }
  }

  for (const block of blocks) {
    if (block.type !== 'image') continue;
    const rel = block.path || block.src;
    if (!rel) continue;
    const abs = absProjectPath(rel);
    if (!abs) continue;
    const ix = Number(block.x_mm) || 0;
    const iy = Number(block.y_mm) || 0;
    const iw = Number(block.width_mm) || 8;
    const ih = Number(block.height_mm) || 8;
    try {
      const ext = path.extname(abs).toLowerCase();
      const buf = fs.readFileSync(abs);
      const embedded =
        ext === '.png' ? await pdfDoc.embedPng(buf) : ext === '.jpg' || ext === '.jpeg' ? await pdfDoc.embedJpg(buf) : null;
      if (!embedded) continue;
      const imgY = originY + mmToPt(labelHmm - iy - ih);
      const imgX = originX + mmToPt(ix);
      page.drawImage(embedded, {
        x: imgX,
        y: imgY,
        width: mmToPt(iw),
        height: mmToPt(ih)
      });
    } catch {
      /* skip missing image */
    }
  }

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

  for (const block of blocks) {
    if (block.type !== 'text') continue;
    const text = getFieldValue(item, block.field);
    if (!text) continue;
    const tx = Number(block.x_mm) || 0;
    const ty = Number(block.y_mm) || 0;
    const size = Math.max(4, Math.min(24, Number(block.fontSizePt) || 7));
    const align = block.align || 'left';
    const maxWmm = block.maxWidth_mm != null ? Number(block.maxWidth_mm) : labelWmm;
    const rotDeg = Number(block.rotation_deg) || 0;

    let drawX = originX + mmToPt(tx);
    const textW = font.widthOfTextAtSize(text, size);
    const maxWpt = mmToPt(maxWmm);
    if (align === 'center') {
      drawX = originX + mmToPt(tx) - textW / 2;
    } else if (align === 'right') {
      drawX = originX + mmToPt(tx) - textW;
    }

    const baselineY = originY + mmToPt(labelHmm - ty) - size * 0.8;

    const textOpts = {
      x: drawX,
      y: baselineY,
      size,
      font,
      color: rgb(0, 0, 0),
      maxWidth: Math.min(textW + 2, maxWpt)
    };
    if (rotDeg !== 0) {
      textOpts.rotate = degrees(rotDeg);
    }
    page.drawText(text, textOpts);
  }

  drawLayoutBorder(page, layout, originX, originY, labelWmm, labelHmm);
}

function drawHeaderRegions(page, regions, meta, font, pageHpt) {
  const list = Array.isArray(regions) ? regions : [];
  for (const r of list) {
    const text = resolveHeaderValue(r.key, meta);
    if (!text) continue;
    const xMm = Number(r.x_mm) || 0;
    const yMm = Number(r.y_mm) || 0;
    const size = Math.max(5, Math.min(18, Number(r.fontSizePt) || 9));
    const align = r.align || 'left';
    let drawX = mmToPt(xMm);
    const tw = font.widthOfTextAtSize(text, size);
    if (align === 'center') drawX -= tw / 2;
    if (align === 'right') drawX -= tw;
    const baselineY = pageHpt - mmToPt(yMm) - size * 0.85;
    page.drawText(text, {
      x: drawX,
      y: baselineY,
      size,
      font,
      color: rgb(0, 0, 0)
    });
  }
}

async function embedPageBackground(pdfDoc, absPath) {
  const ext = path.extname(absPath).toLowerCase();
  const buf = fs.readFileSync(absPath);
  if (ext === '.png') return pdfDoc.embedPng(buf);
  if (ext === '.jpg' || ext === '.jpeg') return pdfDoc.embedJpg(buf);
  throw new Error('Page background must be PNG or JPEG');
}

/**
 * Buyer sheet: one PDF page size = template mm, optional background, header text, label grid.
 */
async function buildComposedBatchPdf(items, labelTplRow, pageTplRow, pageMetadata, _settings) {
  const layoutBase = labelTplRow.layout || JSON.parse(labelTplRow.layout_json || '{}');
  const labelWmm = Number(labelTplRow.width_mm);
  const labelHmm = Number(labelTplRow.height_mm);

  const grid = pageTplRow.label_grid || {};
  const cols = Math.max(1, Math.min(20, parseInt(grid.cols, 10) || 5));
  const rows = Math.max(1, Math.min(50, parseInt(grid.rows, 10) || 6));
  const cellWmm = Number(grid.cell_width_mm) || labelWmm;
  const cellHmm = Number(grid.cell_height_mm) || labelHmm;
  const hGap = Number(grid.h_gap_mm) || 0;
  const vGap = Number(grid.v_gap_mm) || 0;
  const ox0 = Number(grid.origin_x_mm) || 0;
  const oy0 = Number(grid.origin_y_mm) || 0;

  const pageWmm = Number(pageTplRow.page_width_mm) || 210;
  const pageHmm = Number(pageTplRow.page_height_mm) || 297;
  const pageWpt = mmToPt(pageWmm);
  const pageHpt = mmToPt(pageHmm);

  const flat = flattenItems(items);
  const perPage = cols * rows;
  const meta = pageMetadata && typeof pageMetadata === 'object' ? pageMetadata : {};

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const bgPath = absProjectPath(pageTplRow.background_image_path);

  let idx = 0;
  if (flat.length === 0) {
    const page = pdfDoc.addPage([pageWpt, pageHpt]);
    drawHeaderRegions(page, pageTplRow.header_regions, meta, font, pageHpt);
    page.drawText('No label items.', { x: 40, y: pageHpt - 100, size: 12, font });
    return pdfDoc.save();
  }

  while (idx < flat.length) {
    const page = pdfDoc.addPage([pageWpt, pageHpt]);

    if (bgPath) {
      try {
        const img = await embedPageBackground(pdfDoc, bgPath);
        page.drawImage(img, { x: 0, y: 0, width: pageWpt, height: pageHpt });
      } catch {
        page.drawRectangle({
          x: 0,
          y: 0,
          width: pageWpt,
          height: pageHpt,
          color: rgb(0.96, 0.96, 0.96)
        });
        page.drawText('(Background image missing or invalid)', {
          x: 40,
          y: pageHpt - 40,
          size: 10,
          font
        });
      }
    } else {
      page.drawRectangle({
        x: 0,
        y: 0,
        width: pageWpt,
        height: pageHpt,
        color: rgb(1, 1, 1)
      });
    }

    drawHeaderRegions(page, pageTplRow.header_regions, meta, font, pageHpt);

    const scale = Math.min(cellWmm / labelWmm, cellHmm / labelHmm);
    const scaledLayout = scaleLayout(layoutBase, scale);
    const drawnW = labelWmm * scale;
    const drawnH = labelHmm * scale;
    const padX = (cellWmm - drawnW) / 2;
    const padY = (cellHmm - drawnH) / 2;

    for (let slot = 0; slot < perPage && idx < flat.length; slot++) {
      const col = slot % cols;
      const row = Math.floor(slot / cols);
      const cellLeftMm = ox0 + col * (cellWmm + hGap) + padX;
      const cellTopMm = oy0 + row * (cellHmm + vGap) + padY;
      const originX = mmToPt(cellLeftMm);
      const originY = pageHpt - mmToPt(cellTopMm) - mmToPt(drawnH);

      await drawLabel(
        pdfDoc,
        page,
        originX,
        originY,
        drawnW,
        drawnH,
        scaledLayout,
        labelTplRow.barcode_type,
        flat[idx],
        font,
        { skipCellBackground: true }
      );
      idx++;
    }
  }

  return pdfDoc.save();
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
        font,
        {}
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
  const pageTemplateService = require('./pageTemplateService');

  const template = templateService.getTemplate(batch.template_id);
  if (!template) {
    const e = new Error('Template not found');
    e.code = 'NOT_FOUND';
    throw e;
  }

  const settings = settingsService.getAll();

  if (batch.page_template_id) {
    const pt = pageTemplateService.getPageTemplate(batch.page_template_id);
    if (!pt) {
      const e = new Error('Page layout template not found');
      e.code = 'NOT_FOUND';
      throw e;
    }
    const meta = batch.page_metadata || {};
    const bytes = await buildComposedBatchPdf(batch.items || [], template, pt, meta, settings);
    return Buffer.from(bytes);
  }

  const bytes = await buildPdfForBatch(template, batch.items || [], settings);
  return Buffer.from(bytes);
}

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
  buildComposedBatchPdf,
  exportBatchToBuffer,
  buildPreviewPdf,
  getFieldValue,
  flattenItems,
  drawLabel
};
