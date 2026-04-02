const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const templateService = require('../services/templateService');
const pageTemplateService = require('../services/pageTemplateService');
const batchService = require('../services/batchService');
const settingsService = require('../services/settingsService');
const { parseCsvBuffer } = require('../services/csvImportService');
const { exportBatchToBuffer, buildPreviewPdf } = require('../services/pdfExportService');
const { renderPngBuffer } = require('../services/barcodeService');
const { validateBarcodeValue } = require('../utils/barcodeValidation');

const router = express.Router();

const importsDir = path.join(__dirname, '..', '..', 'imports');
const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
[importsDir, uploadsDir].forEach((d) => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

const uploadCsv = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, importsDir),
    filename: (_req, file, cb) => {
      const safe = `import-${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      cb(null, safe);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 }
});

const uploadBg = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      cb(null, `bg-${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 }
});

const uploadPageBg = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      cb(null, `page-${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`);
    }
  }),
  limits: { fileSize: 30 * 1024 * 1024 }
});

/** User-supplied PNG/JPEG for label templates (e.g. scissors). Field name: file */
const uploadLabelAsset = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      cb(null, `label-asset-${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 }
});

router.post('/upload-asset', (req, res) => {
  uploadLabelAsset.single('file')(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        const msg =
          err.code === 'LIMIT_FILE_SIZE'
            ? 'File too large (max 5 MB)'
            : err.message || String(err.code);
        return res.status(400).json({ error: msg });
      }
      return res.status(500).json({ error: err.message || 'Upload failed' });
    }
    if (!req.file) return res.status(400).json({ error: 'file required (field name: file)' });
    try {
      const root = path.join(__dirname, '..', '..');
      const rel = path.relative(root, req.file.path).replace(/\\/g, '/');
      const filename = path.basename(req.file.path);
      res.json({
        path: rel,
        filename,
        original_name: req.file.originalname
      });
    } catch (e) {
      res.status(500).json({ error: e.message || 'Upload failed' });
    }
  });
});

// ——— Templates ———
router.get('/templates', (_req, res) => {
  try {
    res.json(templateService.listTemplates());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/templates/:id', (req, res) => {
  const t = templateService.getTemplate(Number(req.params.id));
  if (!t) return res.status(404).json({ error: 'Not found' });
  res.json(t);
});

router.post('/templates', express.json(), (req, res) => {
  try {
    const saved = templateService.saveTemplate(req.body);
    res.json(saved);
  } catch (e) {
    const code = e.code === 'VALIDATION' ? 400 : 500;
    res.status(code).json({ error: e.message });
  }
});

router.put('/templates/:id', express.json(), (req, res) => {
  try {
    const saved = templateService.saveTemplate({ ...req.body, id: Number(req.params.id) });
    res.json(saved);
  } catch (e) {
    const code = e.code === 'VALIDATION' ? 400 : e.code === 'IN_USE' ? 409 : 500;
    res.status(code).json({ error: e.message });
  }
});

router.delete('/templates/:id', (req, res) => {
  try {
    res.json(templateService.deleteTemplate(Number(req.params.id)));
  } catch (e) {
    const code = e.code === 'IN_USE' ? 409 : 500;
    res.status(code).json({ error: e.message });
  }
});

router.post('/templates/:id/background', uploadBg.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file required' });
  const rel = path.relative(path.join(__dirname, '..', '..'), req.file.path).replace(/\\/g, '/');
  const t = templateService.getTemplate(Number(req.params.id));
  if (!t) return res.status(404).json({ error: 'Template not found' });
  const layout = t.layout || {};
  const saved = templateService.saveTemplate({
    id: t.id,
    template_name: t.template_name,
    width_mm: t.width_mm,
    height_mm: t.height_mm,
    barcode_type: t.barcode_type,
    layout,
    background_image_path: rel
  });
  res.json({ ok: true, background_image_path: rel, template: saved });
});

// ——— Page layouts (buyer sheet: background + header fields + label grid) ———
router.get('/page-templates/preset/tafeeta', (_req, res) => {
  res.json({ preset: pageTemplateService.PRESET_TAFEETA });
});

router.get('/page-templates', (_req, res) => {
  try {
    res.json(pageTemplateService.listPageTemplates());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/page-templates/:id', (req, res) => {
  const t = pageTemplateService.getPageTemplate(Number(req.params.id));
  if (!t) return res.status(404).json({ error: 'Not found' });
  res.json(t);
});

router.post('/page-templates', express.json(), (req, res) => {
  try {
    res.json(pageTemplateService.savePageTemplate(req.body));
  } catch (e) {
    const code = e.code === 'VALIDATION' ? 400 : 500;
    res.status(code).json({ error: e.message });
  }
});

router.put('/page-templates/:id', express.json(), (req, res) => {
  try {
    res.json(pageTemplateService.savePageTemplate({ ...req.body, id: Number(req.params.id) }));
  } catch (e) {
    const code = e.code === 'VALIDATION' ? 400 : e.code === 'IN_USE' ? 409 : 500;
    res.status(code).json({ error: e.message });
  }
});

router.delete('/page-templates/:id', (req, res) => {
  try {
    res.json(pageTemplateService.deletePageTemplate(Number(req.params.id)));
  } catch (e) {
    const code = e.code === 'IN_USE' ? 409 : 500;
    res.status(code).json({ error: e.message });
  }
});

router.post('/page-templates/:id/background', uploadPageBg.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file required (PNG or JPEG export of full page)' });
  const rel = path.relative(path.join(__dirname, '..', '..'), req.file.path).replace(/\\/g, '/');
  const t = pageTemplateService.getPageTemplate(Number(req.params.id));
  if (!t) return res.status(404).json({ error: 'Page template not found' });
  const saved = pageTemplateService.savePageTemplate({
    id: t.id,
    name: t.name,
    page_width_mm: t.page_width_mm,
    page_height_mm: t.page_height_mm,
    background_image_path: rel,
    header_regions: t.header_regions,
    label_grid: t.label_grid,
    dynamic_fields: t.dynamic_fields
  });
  res.json({ ok: true, background_image_path: rel, page_template: saved });
});

// ——— Batches ———
router.get('/batches', (_req, res) => {
  try {
    res.json(batchService.listBatches());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/batches/:id', (req, res) => {
  const b = batchService.getBatch(Number(req.params.id));
  if (!b) return res.status(404).json({ error: 'Not found' });
  res.json(b);
});

router.post('/batches', express.json(), (req, res) => {
  try {
    const { name, template_id, page_template_id, page_metadata } = req.body;
    const b = batchService.createBatch(name || 'Untitled batch', template_id, {
      page_template_id,
      page_metadata
    });
    res.json(b);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.patch('/batches/:id', express.json(), (req, res) => {
  try {
    const b = batchService.updateBatch(Number(req.params.id), req.body);
    if (!b) return res.status(404).json({ error: 'Not found' });
    res.json(b);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/batches/:id/items', express.json(), (req, res) => {
  try {
    const id = Number(req.params.id);
    const { items, replace } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items array required' });
    }
    if (replace) batchService.clearItems(id);
    const b = batchService.addItems(id, items);
    res.json(b);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.delete('/batches/:id', (req, res) => {
  try {
    res.json(batchService.deleteBatch(Number(req.params.id)));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ——— PDF ———
router.get('/batches/:id/pdf', async (req, res) => {
  try {
    const b = batchService.getBatch(Number(req.params.id));
    if (!b) return res.status(404).json({ error: 'Not found' });
    const buf = await exportBatchToBuffer(b);
    const inline = req.query.inline === '1';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      inline ? `inline; filename="batch-${b.id}.pdf"` : `attachment; filename="labels-${b.id}.pdf"`
    );
    res.send(buf);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ——— Full label preview as PDF (one page, one label) ———
router.post('/preview-pdf', express.json(), async (req, res) => {
  try {
    const { template_id, template: inline, item } = req.body;
    let t;
    const w = Number(inline && inline.width_mm);
    const h = Number(inline && inline.height_mm);
    const useInline =
      inline &&
      inline.layout &&
      typeof inline.layout === 'object' &&
      Number.isFinite(w) &&
      w > 0 &&
      Number.isFinite(h) &&
      h > 0;
    if (useInline) {
      t = {
        width_mm: w,
        height_mm: h,
        barcode_type: inline.barcode_type || 'code128',
        layout: inline.layout,
        layout_json: JSON.stringify(inline.layout)
      };
    } else {
      t = templateService.getTemplate(Number(template_id));
      if (!t) {
        return res.status(400).json({
          error:
            'Template not found or invalid inline preview. Send template.width_mm, template.height_mm (> 0), and template.layout, or a valid template_id.'
        });
      }
    }
    const buf = await buildPreviewPdf(t, item || {});
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="preview.pdf"');
    res.send(buf);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ——— Barcode-only PNG (quick check / debugging) ———
router.post('/preview-label', express.json(), async (req, res) => {
  try {
    const { template_id, item } = req.body;
    const t = templateService.getTemplate(Number(template_id));
    if (!t) return res.status(404).json({ error: 'Template not found' });

    const layout = t.layout || {};
    const sample = item || {
      sku: 'PNC 533611 XXXL',
      barcode_value: 'PNC 533611 XXXL',
      item_name: 'PNC 533611 XXXL',
      size: 'XXXL',
      color: 'Black',
      mrp: '999'
    };

    const bc = layout.barcode || {};
    const sourceField = bc.sourceField || 'barcode_value';
    const { getFieldValue } = require('../services/pdfExportService');
    const raw = getFieldValue(sample, sourceField) || sample.barcode_value;
    const bcType = bc.type || t.barcode_type;

    const png = await renderPngBuffer(bcType, raw, { scale: 3 });
    res.type('png').send(png);
  } catch (e) {
    if (e.code === 'BARCODE_INVALID') {
      return res.status(400).json({ error: e.message });
    }
    res.status(500).json({ error: e.message });
  }
});

// ——— Barcode validate ———
router.post('/validate-barcode', express.json(), (req, res) => {
  const { type, value } = req.body;
  const r = validateBarcodeValue(type, value);
  if (!r.ok) return res.status(400).json(r);
  res.json(r);
});

// ——— CSV import ———
router.post('/import/csv', uploadCsv.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file required (field name: file)' });
  try {
    const buf = fs.readFileSync(req.file.path);
    const barcodeColumn = req.body.barcodeColumn || 'barcode_value';
    const result = parseCsvBuffer(buf, { barcodeColumn });
    res.json({
      ...result,
      savedPath: req.file.filename
    });
  } catch (e) {
    const code = e.code === 'CSV_PARSE' || e.code === 'CSV_EMPTY' ? 400 : 500;
    res.status(code).json({ error: e.message });
  }
});

// ——— Settings ———
router.get('/settings', (_req, res) => {
  res.json(settingsService.getAll());
});

router.put('/settings', express.json(), (req, res) => {
  try {
    settingsService.setMany(req.body || {});
    res.json(settingsService.getAll());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
