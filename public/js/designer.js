/* global apiJson, apiUrl */

let currentId = null;

const sampleItem = () => ({
  sku: 'PNC 533611 XXXL',
  barcode_value: 'PNC 533611 XXXL',
  item_name: 'PNC 533611 XXXL',
  size: 'XXXL',
  mrp: '',
  extra_data_json: JSON.stringify({ vendor_code: '32026910' })
});

function blockRow(b, i) {
  const el = document.createElement('div');
  el.className = 'row';
  el.style.marginBottom = '0.5rem';
  el.dataset.idx = String(i);
  el.innerHTML = `
    <div><label>Field</label>
      <select class="bf">
        <option value="sku">sku</option>
        <option value="item_name">item_name</option>
        <option value="barcode_value">barcode_value</option>
        <option value="size">size</option>
        <option value="color">color</option>
        <option value="mrp">mrp</option>
        <option value="product_line">product_line</option>
        <option value="vendor_code">vendor_code</option>
      </select>
    </div>
    <div><label>X mm</label><input type="number" class="bx" step="0.1" /></div>
    <div><label>Y mm</label><input type="number" class="by" step="0.1" /></div>
    <div><label>Font pt</label><input type="number" class="bfs" step="0.5" min="4" max="24" /></div>
    <div><label>Align</label>
      <select class="ba">
        <option value="left">left</option>
        <option value="center">center</option>
        <option value="right">right</option>
      </select>
    </div>
    <div><label>Rot °</label><input type="number" class="brot" step="1" /></div>
    <div><label>&nbsp;</label><button type="button" class="secondary rm">Remove</button></div>
  `;
  el.querySelector('.bf').value = b.field || 'sku';
  el.querySelector('.bx').value = b.x_mm ?? 0;
  el.querySelector('.by').value = b.y_mm ?? 0;
  el.querySelector('.bfs').value = b.fontSizePt ?? 7;
  el.querySelector('.ba').value = b.align || 'left';
  el.querySelector('.brot').value = b.rotation_deg != null ? b.rotation_deg : 0;
  el.querySelector('.rm').onclick = () => {
    el.remove();
    syncJsonTextarea();
  };
  return el;
}

function readBlocks() {
  const out = [];
  document.querySelectorAll('#blocks .row').forEach((row) => {
    const rot = parseFloat(row.querySelector('.brot').value);
    const o = {
      type: 'text',
      field: row.querySelector('.bf').value,
      x_mm: parseFloat(row.querySelector('.bx').value) || 0,
      y_mm: parseFloat(row.querySelector('.by').value) || 0,
      fontSizePt: parseFloat(row.querySelector('.bfs').value) || 7,
      align: row.querySelector('.ba').value
    };
    if (!Number.isNaN(rot) && rot !== 0) o.rotation_deg = rot;
    out.push(o);
  });
  return out;
}

function writeBlocks(blocks) {
  const host = document.getElementById('blocks');
  host.innerHTML = '';
  (blocks || []).forEach((b, i) => host.appendChild(blockRow(b, i)));
}

function imageRow(b, i) {
  const el = document.createElement('div');
  el.className = 'row irow';
  el.style.marginBottom = '0.5rem';
  el.dataset.idx = String(i);
  el.innerHTML = `
    <div style="flex: 1; min-width: 140px"><label>Path (auto-filled from file)</label>
      <input type="text" class="ipath" placeholder="Choose File below — path appears here" title="Populated after upload; you can edit if needed" />
      <div class="ifileinfo muted" style="font-size: 0.85rem; margin-top: 0.25rem; min-height: 1.2em"></div></div>
    <div><label>Choose file</label><input type="file" class="iup" accept="image/png,image/jpeg" /></div>
    <div><label>X mm</label><input type="number" class="ix" step="0.1" /></div>
    <div><label>Y mm</label><input type="number" class="iy" step="0.1" /></div>
    <div><label>W mm</label><input type="number" class="iw" step="0.1" /></div>
    <div><label>H mm</label><input type="number" class="ih" step="0.1" /></div>
    <div><label>&nbsp;</label><button type="button" class="secondary irm">Remove</button></div>
  `;
  el.querySelector('.ipath').value = b.path || b.src || '';
  el.querySelector('.ix').value = b.x_mm ?? 2;
  el.querySelector('.iy').value = b.y_mm ?? 2;
  el.querySelector('.iw').value = b.width_mm ?? 6;
  el.querySelector('.ih').value = b.height_mm ?? 6;
  const info = el.querySelector('.ifileinfo');
  const p = b.path || b.src || '';
  if (info && p) {
    const base = p.split(/[/\\]/).pop();
    if (base) info.textContent = `Current: ${base}`;
  }
  el.querySelector('.irm').onclick = () => {
    el.remove();
    syncJsonTextarea();
  };
  bindImageRowUpload(el);
  return el;
}

function bindImageRowUpload(row) {
  const file = row.querySelector('.iup');
  const pathInput = row.querySelector('.ipath');
  const info = row.querySelector('.ifileinfo');
  const msg = document.getElementById('msg');
  file.addEventListener('change', async () => {
    const picked = file.files && file.files[0];
    if (!picked) return;
    if (info) info.textContent = `Selected: ${picked.name} — uploading…`;
    const fd = new FormData();
    fd.append('file', picked);
    try {
      const r = await fetch(apiUrl('/upload-asset'), { method: 'POST', body: fd });
      const text = await r.text();
      let data;
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        const isHtml = /^\s*</.test(text || '');
        throw new Error(
          isHtml
            ? 'Upload hit the wrong server (got a web page, not JSON). Run: npm start — then open http://127.0.0.1:3847/designer.html (do not use Live Server or file://).'
            : 'Invalid response from server.'
        );
      }
      if (!r.ok) throw new Error((data && data.error) || r.statusText || 'Upload failed');
      const savedPath = data.path || '';
      const savedName = data.filename || savedPath.split(/[/\\]/).pop() || '';
      pathInput.value = savedPath;
      pathInput.dispatchEvent(new Event('input', { bubbles: true }));
      if (info) {
        const orig = data.original_name && data.original_name !== savedName ? ` · from “${data.original_name}”` : '';
        info.textContent = savedName ? `Saved: ${savedName}${orig} → ${savedPath}` : savedPath;
      }
      file.value = '';
      msg.textContent = '';
      msg.className = '';
      syncJsonTextarea();
    } catch (e) {
      msg.className = 'err';
      msg.textContent = e.message || String(e);
      if (info) info.textContent = `Upload failed (${picked.name})`;
    }
  });
}

function readImageBlocks() {
  const out = [];
  document.querySelectorAll('#imageBlocks .irow').forEach((row) => {
    const p = (row.querySelector('.ipath').value || '').trim();
    if (!p) return;
    out.push({
      type: 'image',
      path: p,
      x_mm: parseFloat(row.querySelector('.ix').value) || 0,
      y_mm: parseFloat(row.querySelector('.iy').value) || 0,
      width_mm: parseFloat(row.querySelector('.iw').value) || 8,
      height_mm: parseFloat(row.querySelector('.ih').value) || 8
    });
  });
  return out;
}

function writeImageBlocks(blocks) {
  const host = document.getElementById('imageBlocks');
  host.innerHTML = '';
  (blocks || []).forEach((b, i) => {
    if (!b || b.type !== 'image') return;
    host.appendChild(imageRow(b, i));
  });
}

function layoutFromForm() {
  let base = {};
  try {
    base = JSON.parse(document.getElementById('layoutJson').value || '{}');
  } catch {
    base = {};
  }
  const textFromForm = readBlocks();
  const formImages = readImageBlocks();
  const jsonImages = (Array.isArray(base.blocks) ? base.blocks : []).filter(
    (b) => b && b.type === 'image'
  );
  /** If layout JSON has image blocks but user did not click "Apply JSON → form", DOM rows are empty — still use JSON images for Preview/Save. */
  const imageBlocks = formImages.length > 0 ? formImages : jsonImages;
  const otherBlocks = (Array.isArray(base.blocks) ? base.blocks : []).filter(
    (b) => b && b.type && b.type !== 'text' && b.type !== 'image'
  );
  const mergedBlocks = [...otherBlocks, ...imageBlocks, ...textFromForm];

  return {
    border: {
      enabled: document.getElementById('borderEn').checked,
      width_pt: parseFloat(document.getElementById('borderWpt').value) || 1,
      color: (document.getElementById('borderColor').value || '#000000').trim(),
      inset_mm: parseFloat(document.getElementById('borderInset').value) || 0
    },
    barcode: {
      x_mm: parseFloat(document.getElementById('bcX').value) || 0,
      y_mm: parseFloat(document.getElementById('bcY').value) || 0,
      width_mm: parseFloat(document.getElementById('bcW').value) || 30,
      height_mm: parseFloat(document.getElementById('bcH').value) || 10,
      type: document.getElementById('bcType').value,
      sourceField: document.getElementById('srcField').value
    },
    blocks: mergedBlocks,
    sheet: {
      cols: parseInt(document.getElementById('cols').value, 10) || 1,
      rows: parseInt(document.getElementById('rows').value, 10) || 1,
      hGap_mm: parseFloat(document.getElementById('hGap').value) || 0,
      vGap_mm: parseFloat(document.getElementById('vGap').value) || 0
    },
    label_size_mm: {
      width_mm: parseFloat(document.getElementById('wmm').value) || 54,
      height_mm: parseFloat(document.getElementById('hmm').value) || 20
    }
  };
}

function syncJsonTextarea() {
  document.getElementById('layoutJson').value = JSON.stringify(layoutFromForm(), null, 2);
}

function applyFormFromLayout(layout) {
  const sz = layout.label_size_mm;
  if (sz && typeof sz === 'object') {
    if (sz.width_mm != null && sz.width_mm !== '') document.getElementById('wmm').value = sz.width_mm;
    if (sz.height_mm != null && sz.height_mm !== '') document.getElementById('hmm').value = sz.height_mm;
  }
  const bc = layout.barcode || {};
  document.getElementById('bcX').value = bc.x_mm ?? 0;
  document.getElementById('bcY').value = bc.y_mm ?? 0;
  document.getElementById('bcW').value = bc.width_mm ?? 30;
  document.getElementById('bcH').value = bc.height_mm ?? 10;
  if (bc.type) document.getElementById('bcType').value = bc.type;
  document.getElementById('srcField').value = bc.sourceField || 'barcode_value';
  const sh = layout.sheet || {};
  document.getElementById('cols').value = sh.cols ?? 1;
  document.getElementById('rows').value = sh.rows ?? 1;
  document.getElementById('hGap').value = sh.hGap_mm ?? 0;
  document.getElementById('vGap').value = sh.vGap_mm ?? 0;
  const br = layout.border || {};
  document.getElementById('borderEn').checked = !!br.enabled;
  document.getElementById('borderWpt').value = br.width_pt ?? 1;
  document.getElementById('borderColor').value = br.color || '#000000';
  document.getElementById('borderInset').value = br.inset_mm ?? 0;
  const textBlocks = (layout.blocks || []).filter((b) => b && (!b.type || b.type === 'text'));
  const imageBlocks = (layout.blocks || []).filter((b) => b && b.type === 'image');
  writeBlocks(textBlocks);
  writeImageBlocks(imageBlocks);
}

async function loadTemplateList() {
  const list = await apiJson('/templates');
  const sel = document.getElementById('tplSelect');
  const cur = sel.value;
  sel.innerHTML = '<option value="">— New template —</option>';
  list.forEach((t) => {
    const o = document.createElement('option');
    o.value = t.id;
    o.textContent = t.template_name;
    sel.appendChild(o);
  });
  if (cur) sel.value = cur;
}

function fillTemplate(t) {
  currentId = t ? t.id : null;
  document.getElementById('tplName').value = t ? t.template_name : '';
  document.getElementById('wmm').value = t ? t.width_mm : 54;
  document.getElementById('hmm').value = t ? t.height_mm : 20;
  document.getElementById('bcType').value = t ? t.barcode_type : 'code128';
  if (t && t.layout) {
    applyFormFromLayout(t.layout);
  } else {
    applyFormFromLayout({
      border: { enabled: true, width_pt: 1, color: '#000000', inset_mm: 0.3 },
      barcode: { x_mm: 7, y_mm: 2, width_mm: 40, height_mm: 9, type: 'code128', sourceField: 'barcode_value' },
      blocks: [
        { type: 'text', field: 'sku', x_mm: 27, y_mm: 12, fontSizePt: 6, align: 'center' },
        { type: 'text', field: 'size', x_mm: 48, y_mm: 6, fontSizePt: 7, align: 'right' }
      ],
      sheet: { cols: 1, rows: 1, hGap_mm: 2, vGap_mm: 2 }
    });
  }
  syncJsonTextarea();
}

let previewObjectUrl = null;

async function runPreview() {
  const msg = document.getElementById('msg');
  msg.textContent = '';
  msg.className = 'err';
  const layout = layoutFromForm();
  const wmm = parseFloat(document.getElementById('wmm').value);
  const hmm = parseFloat(document.getElementById('hmm').value);
  const body = {
    template: {
      width_mm: Number.isFinite(wmm) && wmm > 0 ? wmm : 54,
      height_mm: Number.isFinite(hmm) && hmm > 0 ? hmm : 20,
      barcode_type: document.getElementById('bcType').value,
      layout
    },
    item: sampleItem()
  };
  const r = await fetch(apiUrl('/preview-pdf'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!r.ok) {
    const text = await r.text();
    let errMsg = r.statusText;
    try {
      const j = JSON.parse(text);
      if (j && j.error) errMsg = j.error;
    } catch {
      if (/^\s*</.test(text)) {
        errMsg =
          'Server returned HTML instead of PDF. Use npm start and open http://127.0.0.1:3847/designer.html';
      } else if (text) errMsg = text.slice(0, 200);
    }
    msg.textContent = errMsg;
    return;
  }
  const ctype = (r.headers.get('Content-Type') || '').toLowerCase();
  if (!ctype.includes('pdf')) {
    msg.textContent = 'Unexpected response (not PDF). Check server logs.';
    return;
  }
  msg.className = '';
  const buf = await r.arrayBuffer();
  const blob = new Blob([buf], { type: 'application/pdf' });
  const iframe = document.getElementById('preview');
  if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
  previewObjectUrl = URL.createObjectURL(blob);
  iframe.src = previewObjectUrl;
}

document.getElementById('blocks').addEventListener('input', syncJsonTextarea);
document.getElementById('blocks').addEventListener('change', syncJsonTextarea);
document.getElementById('imageBlocks').addEventListener('input', syncJsonTextarea);
document.getElementById('imageBlocks').addEventListener('change', syncJsonTextarea);

document.getElementById('addBlock').onclick = () => {
  document.getElementById('blocks').appendChild(
    blockRow({ type: 'text', field: 'sku', x_mm: 5, y_mm: 14, fontSizePt: 7, align: 'left' }, 0)
  );
  syncJsonTextarea();
};

document.getElementById('addImageBlock').onclick = () => {
  document.getElementById('imageBlocks').appendChild(
    imageRow({ type: 'image', path: '', x_mm: 2, y_mm: 2, width_mm: 6, height_mm: 6 }, 0)
  );
  syncJsonTextarea();
};

document.getElementById('btnApplyJson').onclick = () => {
  try {
    const layout = JSON.parse(document.getElementById('layoutJson').value);
    applyFormFromLayout(layout);
    syncJsonTextarea();
    document.getElementById('msg').textContent = '';
  } catch (e) {
    document.getElementById('msg').textContent = 'Invalid JSON: ' + e.message;
  }
};

[
  'bcX',
  'bcY',
  'bcW',
  'bcH',
  'wmm',
  'hmm',
  'cols',
  'rows',
  'hGap',
  'vGap',
  'srcField',
  'bcType',
  'borderEn',
  'borderWpt',
  'borderInset',
  'borderColor'
].forEach((id) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('change', syncJsonTextarea);
  el.addEventListener('input', syncJsonTextarea);
});

document.getElementById('btnSave').onclick = async () => {
  const msg = document.getElementById('msg');
  msg.textContent = '';
  msg.className = 'err';
  try {
    const layout = layoutFromForm();
    const payload = {
      template_name: document.getElementById('tplName').value.trim() || 'Untitled',
      width_mm: parseFloat(document.getElementById('wmm').value),
      height_mm: parseFloat(document.getElementById('hmm').value),
      barcode_type: document.getElementById('bcType').value,
      layout
    };
    let res;
    if (currentId) {
      res = await apiJson('/templates/' + currentId, {
        method: 'PUT',
        body: JSON.stringify({ ...payload, id: currentId })
      });
    } else {
      res = await apiJson('/templates', { method: 'POST', body: JSON.stringify(payload) });
      currentId = res.id;
    }
    await loadTemplateList();
    document.getElementById('tplSelect').value = String(res.id);
    msg.className = 'ok';
    msg.textContent = 'Saved.';
  } catch (e) {
    msg.textContent = e.message;
  }
};

document.getElementById('btnPreview').onclick = () => runPreview().catch((e) => {
  document.getElementById('msg').textContent = e.message;
});

document.getElementById('btnDelete').onclick = async () => {
  if (!currentId || !confirm('Delete this template?')) return;
  try {
    await apiJson('/templates/' + currentId, { method: 'DELETE' });
    currentId = null;
    document.getElementById('tplSelect').value = '';
    fillTemplate(null);
    await loadTemplateList();
    document.getElementById('msg').className = 'ok';
    document.getElementById('msg').textContent = 'Deleted.';
  } catch (e) {
    document.getElementById('msg').className = 'err';
    document.getElementById('msg').textContent = e.message;
  }
};

document.getElementById('tplSelect').onchange = async () => {
  const v = document.getElementById('tplSelect').value;
  if (!v) {
    currentId = null;
    fillTemplate(null);
    return;
  }
  const t = await apiJson('/templates/' + v);
  fillTemplate(t);
};

writeBlocks([
  { type: 'text', field: 'sku', x_mm: 27, y_mm: 12, fontSizePt: 6, align: 'center' },
  { type: 'text', field: 'size', x_mm: 48, y_mm: 6, fontSizePt: 7, align: 'right' }
]);
writeImageBlocks([]);
syncJsonTextarea();

loadTemplateList().then(() => {
  const first = document.getElementById('tplSelect').options[1];
  if (first) {
    document.getElementById('tplSelect').value = first.value;
    document.getElementById('tplSelect').dispatchEvent(new Event('change'));
  }
});
