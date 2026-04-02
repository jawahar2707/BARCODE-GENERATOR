/* global apiJson, apiUrl */

let batchId = null;

function vendorFromExtra(item) {
  if (!item || !item.extra_data_json) return '';
  try {
    const ex = JSON.parse(item.extra_data_json);
    return ex.vendor_code != null ? String(ex.vendor_code) : '';
  } catch {
    return '';
  }
}

function rowEl(data) {
  const vend = escapeAttr(data.vendor_code != null ? data.vendor_code : '');
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="text" class="v-bc" value="${escapeAttr(data.barcode_value || '')}" /></td>
    <td><input type="text" class="v-sk" value="${escapeAttr(data.sku || '')}" /></td>
    <td><input type="text" class="v-sz" value="${escapeAttr(data.size || '')}" /></td>
    <td><input type="text" class="v-vendor" value="${vend}" placeholder="32026910" style="width:5rem" /></td>
    <td><input type="number" class="v-qty" min="1" max="9999" value="${Number(data.qty) || 1}" style="width:4rem" /></td>
    <td><button type="button" class="secondary rm">×</button></td>
  `;
  tr.querySelector('.rm').onclick = () => {
    tr.remove();
    updatePreviewPanel();
  };
  return tr;
}

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

/** Show instructions instead of an empty grey PDF viewer when there is nothing to render. */
function updatePreviewPanel() {
  const iframe = document.getElementById('pdfPreview');
  const ph = document.getElementById('previewPlaceholder');
  if (!iframe || !ph) return;

  if (!batchId) {
    ph.style.display = 'flex';
    ph.innerHTML =
      '<div><strong>No batch yet</strong><br />Use <strong>Create / load batch</strong> above, then add barcodes to the table.</div>';
    iframe.classList.remove('is-visible');
    iframe.removeAttribute('src');
    return;
  }

  const n = readRows().length;
  if (n === 0) {
    ph.style.display = 'flex';
    ph.innerHTML =
      '<div><strong>No barcodes in the table</strong><br />' +
      'Click <kbd>Append lines as items</kbd> or <kbd>Append all combinations</kbd> so <strong>barcode_value</strong> is filled. ' +
      'Then use <kbd>Refresh preview</kbd>.</div>';
    iframe.classList.remove('is-visible');
    iframe.removeAttribute('src');
  }
  /* When rows exist, refreshPreview() hides the placeholder and shows the iframe. */
}

function readRows() {
  const out = [];
  const defV = (document.getElementById('defaultVendorCode') && document.getElementById('defaultVendorCode').value.trim()) || '';
  document.querySelectorAll('#itemRows tr').forEach((tr) => {
    const barcode_value = tr.querySelector('.v-bc').value.trim();
    if (!barcode_value) return;
    const rowVendor = tr.querySelector('.v-vendor').value.trim();
    const vendor_code = rowVendor || defV;
    const row = {
      barcode_value,
      sku: tr.querySelector('.v-sk').value.trim(),
      item_name: '',
      size: tr.querySelector('.v-sz').value.trim(),
      color: '',
      mrp: '',
      qty: parseInt(tr.querySelector('.v-qty').value, 10) || 1
    };
    if (vendor_code) row.vendor_code = vendor_code;
    out.push(row);
  });
  return out;
}

async function loadTemplates() {
  const list = await apiJson('/templates');
  const sel = document.getElementById('tpl');
  sel.innerHTML = '';
  list.forEach((t) => {
    const o = document.createElement('option');
    o.value = t.id;
    o.textContent = `${t.template_name} (${t.width_mm}×${t.height_mm} mm)`;
    sel.appendChild(o);
  });
}

async function loadPageTemplates() {
  const list = await apiJson('/page-templates');
  const sel = document.getElementById('pageTpl');
  const cur = sel.value;
  sel.innerHTML = '<option value="">— Plain PDF (no background) —</option>';
  list.forEach((t) => {
    const o = document.createElement('option');
    o.value = t.id;
    o.textContent = t.name;
    sel.appendChild(o);
  });
  if (cur) sel.value = cur;
}

function readPageMeta() {
  const out = {};
  document.querySelectorAll('#pageFields input[data-meta-key]').forEach((inp) => {
    const k = inp.dataset.metaKey;
    if (k) out[k] = inp.value.trim();
  });
  return out;
}

function buildPageFields(pageTemplate, values) {
  const host = document.getElementById('pageFields');
  host.innerHTML = '';
  if (!pageTemplate || !pageTemplate.dynamic_fields || pageTemplate.dynamic_fields.length === 0) {
    host.innerHTML =
      '<p class="muted">Pick a page layout to type buyer, date, PO, style, etc. (Define fields under Page layouts → dynamic_fields_json.)</p>';
    return;
  }
  const fields = pageTemplate.dynamic_fields.filter((f) => f.section === 'page' || !f.section);
  if (fields.length === 0) {
    host.innerHTML =
      '<p class="muted">No page-level fields in this layout. Add <code>section: "page"</code> in dynamic_fields_json.</p>';
    return;
  }
  const v = values || {};
  fields.forEach((f) => {
    const wrap = document.createElement('div');
    wrap.style.marginBottom = '0.5rem';
    const lab = document.createElement('label');
    lab.setAttribute('for', 'pm_' + f.key);
    lab.textContent = f.label || f.key;
    const inp = document.createElement('input');
    inp.type = f.type === 'date' ? 'date' : 'text';
    inp.id = 'pm_' + f.key;
    inp.dataset.metaKey = f.key;
    inp.value = v[f.key] != null ? String(v[f.key]) : '';
    wrap.appendChild(lab);
    wrap.appendChild(inp);
    host.appendChild(wrap);
  });
}

function setBatchInfo() {
  const el = document.getElementById('batchInfo');
  const prev = document.getElementById('btnPreview');
  const dl = document.getElementById('btnDownload');
  const savePage = document.getElementById('btnSavePageMeta');
  if (!batchId) {
    el.textContent = 'No active batch. Create one to add items.';
    prev.disabled = true;
    dl.style.display = 'none';
    savePage.disabled = true;
    updatePreviewPanel();
    return;
  }
  el.textContent = `Active batch #${batchId} — table is synced when you refresh preview or download (Save is optional).`;
  prev.disabled = false;
  savePage.disabled = false;
  dl.href = apiUrl(`/batches/${batchId}/pdf`);
  dl.download = `labels-${batchId}.pdf`;
  dl.style.display = 'inline-block';
  updatePreviewPanel();
}

async function createOrLoadBatch() {
  const gmsg = document.getElementById('gmsg');
  gmsg.textContent = '';
  const template_id = document.getElementById('tpl').value;
  const name = document.getElementById('batchName').value.trim() || 'Batch';
  if (!template_id) {
    gmsg.textContent = 'Select a label template.';
    return;
  }
  const ptVal = document.getElementById('pageTpl').value;
  const page_template_id = ptVal ? parseInt(ptVal, 10) : null;
  const page_metadata = readPageMeta();

  const b = await apiJson('/batches', {
    method: 'POST',
    body: JSON.stringify({
      name,
      template_id: parseInt(template_id, 10),
      page_template_id,
      page_metadata
    })
  });
  batchId = b.id;
  setBatchInfo();
  await refreshPreview();
}

async function savePageMetaOnly() {
  const gmsg = document.getElementById('gmsg');
  gmsg.textContent = '';
  if (!batchId) {
    gmsg.textContent = 'Create a batch first.';
    return;
  }
  const ptVal = document.getElementById('pageTpl').value;
  await apiJson('/batches/' + batchId, {
    method: 'PATCH',
    body: JSON.stringify({
      page_metadata: readPageMeta(),
      page_template_id: ptVal ? parseInt(ptVal, 10) : null
    })
  });
  gmsg.className = 'ok';
  gmsg.textContent = 'Page / buyer fields saved.';
  await refreshPreview();
}

/** Push grid rows to server so PDF export sees them (skips if no barcode rows). */
async function syncItemsToServerIfAny() {
  if (!batchId) return;
  const items = readRows();
  if (items.length === 0) return;
  await apiJson(`/batches/${batchId}/items`, {
    method: 'POST',
    body: JSON.stringify({ items, replace: true })
  });
}

async function saveItems() {
  const gmsg = document.getElementById('gmsg');
  gmsg.textContent = '';
  if (!batchId) {
    gmsg.textContent = 'Create a batch first.';
    return;
  }
  const items = readRows();
  if (items.length === 0) {
    gmsg.textContent = 'Add at least one row with a barcode value.';
    return;
  }
  await apiJson(`/batches/${batchId}/items`, {
    method: 'POST',
    body: JSON.stringify({ items, replace: true })
  });
  gmsg.className = 'ok';
  gmsg.textContent = 'Items saved.';
  await refreshPreview();
}

async function refreshPreview() {
  if (!batchId) {
    updatePreviewPanel();
    return;
  }
  const gmsg = document.getElementById('gmsg');
  const iframe = document.getElementById('pdfPreview');

  if (readRows().length === 0) {
    updatePreviewPanel();
    return;
  }

  try {
    await syncItemsToServerIfAny();
  } catch (e) {
    gmsg.className = 'err';
    gmsg.textContent = 'Could not save items for preview: ' + e.message;
    return;
  }

  document.getElementById('previewPlaceholder').style.display = 'none';
  iframe.classList.add('is-visible');
  iframe.src = apiUrl(`/batches/${batchId}/pdf?inline=1&t=${Date.now()}`);
}

document.getElementById('btnCreateBatch').onclick = () =>
  createOrLoadBatch().catch((e) => {
    document.getElementById('gmsg').className = 'err';
    document.getElementById('gmsg').textContent = e.message;
  });

document.getElementById('btnSavePageMeta').onclick = () =>
  savePageMetaOnly().catch((e) => {
    document.getElementById('gmsg').className = 'err';
    document.getElementById('gmsg').textContent = e.message;
  });

document.getElementById('btnSaveItems').onclick = () =>
  saveItems().catch((e) => {
    document.getElementById('gmsg').className = 'err';
    document.getElementById('gmsg').textContent = e.message;
  });

document.getElementById('btnPreview').onclick = () =>
  refreshPreview().catch((e) => {
    document.getElementById('gmsg').textContent = e.message;
  });

document.getElementById('btnDownload').addEventListener('click', async (e) => {
  if (!batchId) return;
  e.preventDefault();
  const gmsg = document.getElementById('gmsg');
  if (readRows().length === 0) {
    gmsg.className = 'err';
    gmsg.textContent = 'Add at least one row with barcode_value before downloading.';
    updatePreviewPanel();
    return;
  }
  try {
    await syncItemsToServerIfAny();
  } catch (err) {
    gmsg.className = 'err';
    gmsg.textContent = 'Could not sync items before download: ' + err.message;
    return;
  }
  window.location.assign(apiUrl(`/batches/${batchId}/pdf`));
});

document.getElementById('btnAddRow').onclick = () => {
  const defV = document.getElementById('defaultVendorCode').value.trim();
  document.getElementById('itemRows').appendChild(rowEl(defV ? { vendor_code: defV } : {}));
  updatePreviewPanel();
};

document.getElementById('btnClearItems').onclick = () => {
  document.getElementById('itemRows').innerHTML = '';
  updatePreviewPanel();
  if (batchId) refreshPreview().catch(() => {});
};

document.getElementById('btnQuick').onclick = () => {
  const lines = document
    .getElementById('quickLines')
    .value.split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const tbody = document.getElementById('itemRows');
  const defV = document.getElementById('defaultVendorCode').value.trim();
  lines.forEach((line) => {
    const r = { barcode_value: line, sku: line, qty: 1 };
    if (defV) r.vendor_code = defV;
    tbody.appendChild(rowEl(r));
  });
  document.getElementById('quickLines').value = '';
  if (batchId) refreshPreview().catch(() => {});
  else updatePreviewPanel();
};

/** Apparel-style order for size from–to picker */
const SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '3XL', '4XL', '5XL', '6XL'];

function fillSizeSelects() {
  const fromSel = document.getElementById('sizeFrom');
  const toSel = document.getElementById('sizeTo');
  fromSel.innerHTML = '';
  toSel.innerHTML = '';
  SIZE_ORDER.forEach((sz) => {
    const o1 = document.createElement('option');
    o1.value = sz;
    o1.textContent = sz;
    fromSel.appendChild(o1);
    const o2 = document.createElement('option');
    o2.value = sz;
    o2.textContent = sz;
    toSel.appendChild(o2);
  });
  fromSel.value = 'S';
  toSel.value = 'XXL';
}

/**
 * Expand "PNC 533611" … "PNC 533616" using shared prefix and trailing integer (zero-padded).
 */
function expandSkuNumericRange(startStr, endStr) {
  const re = /^(.*?)(\d+)$/;
  const m1 = String(startStr || '').trim().match(re);
  const m2 = String(endStr || '').trim().match(re);
  if (!m1 || !m2) {
    throw new Error('Start and end SKU must end with digits (e.g. PNC 533611 and PNC 533616).');
  }
  if (m1[1] !== m2[1]) {
    throw new Error('Start and end SKU must share the same text before the final number.');
  }
  const pad = Math.max(m1[2].length, m2[2].length);
  const a = parseInt(m1[2], 10);
  const b = parseInt(m2[2], 10);
  if (Number.isNaN(a) || Number.isNaN(b) || a > b) {
    throw new Error('Invalid numeric range (start must be ≤ end).');
  }
  const prefix = m1[1];
  const out = [];
  for (let n = a; n <= b; n++) {
    out.push(prefix + String(n).padStart(pad, '0'));
  }
  return out;
}

function sizesListForMatrix() {
  const custom = document.getElementById('customSizes').value.trim();
  if (custom) {
    return custom
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  const fromSz = document.getElementById('sizeFrom').value;
  const toSz = document.getElementById('sizeTo').value;
  const i = SIZE_ORDER.indexOf(fromSz);
  const j = SIZE_ORDER.indexOf(toSz);
  if (i === -1 || j === -1) {
    throw new Error('Pick sizes from the list or use custom comma-separated sizes.');
  }
  if (i > j) throw new Error('Size from must be before size to (or use custom sizes).');
  return SIZE_ORDER.slice(i, j + 1);
}

function appendSkuMatrixRows() {
  const gmsg = document.getElementById('gmsg');
  gmsg.textContent = '';
  gmsg.className = '';
  const startSku = document.getElementById('skuRangeStart').value;
  const endSku = document.getElementById('skuRangeEnd').value;
  const bases = expandSkuNumericRange(startSku, endSku);
  const sizes = sizesListForMatrix();
  if (sizes.length === 0) {
    gmsg.className = 'err';
    gmsg.textContent = 'Add at least one size.';
    return;
  }
  const spacer = /-$|_$|\s$/.test(bases[0]) ? '' : ' ';
  const defV = document.getElementById('defaultVendorCode').value.trim();
  const tbody = document.getElementById('itemRows');
  let n = 0;
  for (const base of bases) {
    for (const sz of sizes) {
      const combined = base + spacer + sz;
      const r = {
        barcode_value: combined,
        sku: combined,
        size: sz,
        qty: 1
      };
      if (defV) r.vendor_code = defV;
      tbody.appendChild(rowEl(r));
      n++;
    }
  }
  gmsg.className = 'ok';
  gmsg.textContent = `Appended ${n} row(s) (${bases.length} SKUs × ${sizes.length} sizes).`;
  if (batchId) refreshPreview().catch(() => {});
  else updatePreviewPanel();
}

document.getElementById('btnSkuMatrix').onclick = () => {
  try {
    appendSkuMatrixRows();
  } catch (e) {
    const gmsg = document.getElementById('gmsg');
    gmsg.className = 'err';
    gmsg.textContent = e.message || String(e);
  }
};

document.getElementById('csvFile').onchange = async (ev) => {
  const gmsg = document.getElementById('gmsg');
  gmsg.textContent = '';
  const f = ev.target.files[0];
  if (!f) return;
  const fd = new FormData();
  fd.append('file', f);
  try {
    const r = await fetch(apiUrl('/import/csv'), { method: 'POST', body: fd });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || r.statusText);
    const tbody = document.getElementById('itemRows');
    data.rows.forEach((row) => tbody.appendChild(rowEl(row)));
    if (data.errors && data.errors.length) {
      gmsg.className = 'err';
      gmsg.textContent = `Imported ${data.rows.length} rows. ${data.errors.length} lines skipped.`;
    } else {
      gmsg.className = 'ok';
      gmsg.textContent = `Imported ${data.rows.length} rows.`;
    }
    if (batchId) refreshPreview().catch(() => {});
    else updatePreviewPanel();
  } catch (e) {
    gmsg.className = 'err';
    gmsg.textContent = e.message;
  }
  ev.target.value = '';
};

function loadFromSession() {
  try {
    const raw = sessionStorage.getItem('importedItems');
    if (!raw) return;
    const rows = JSON.parse(raw);
    sessionStorage.removeItem('importedItems');
    const tbody = document.getElementById('itemRows');
    rows.forEach((row) => tbody.appendChild(rowEl(row)));
    if (batchId) refreshPreview().catch(() => {});
    else updatePreviewPanel();
  } catch {
    /* ignore */
  }
}

document.getElementById('pageTpl').onchange = async () => {
  const v = document.getElementById('pageTpl').value;
  if (!v) {
    buildPageFields(null, {});
    return;
  }
  try {
    const pt = await apiJson('/page-templates/' + v);
    buildPageFields(pt, readPageMeta());
  } catch {
    buildPageFields(null, {});
  }
};

async function loadBatchFromQuery() {
  const p = new URLSearchParams(location.search);
  const id = p.get('batch');
  if (!id) return;
  let b;
  try {
    b = await apiJson('/batches/' + id);
  } catch {
    return;
  }
  batchId = b.id;
  document.getElementById('batchName').value = b.name;
  document.getElementById('tpl').value = String(b.template_id);
  if (b.page_template_id) {
    document.getElementById('pageTpl').value = String(b.page_template_id);
  } else {
    document.getElementById('pageTpl').value = '';
  }
  if (b.page_template) {
    buildPageFields(b.page_template, b.page_metadata || {});
  } else {
    buildPageFields(null, {});
  }
  document.getElementById('itemRows').innerHTML = '';
  b.items.forEach((it) =>
    document.getElementById('itemRows').appendChild(
      rowEl({
        barcode_value: it.barcode_value,
        sku: it.sku,
        size: it.size,
        vendor_code: vendorFromExtra(it),
        qty: it.qty
      })
    )
  );
  setBatchInfo();
  await refreshPreview();
}

fillSizeSelects();

Promise.all([loadTemplates(), loadPageTemplates()])
  .then(() => loadBatchFromQuery())
  .then(() => loadFromSession())
  .then(() => setBatchInfo())
  .then(() => updatePreviewPanel())
  .catch((e) => {
    document.getElementById('gmsg').textContent = e.message;
  });
