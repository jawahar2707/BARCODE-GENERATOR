/* global apiJson, apiUrl */

let batchId = null;

function rowEl(data) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="text" class="v-bc" value="${escapeAttr(data.barcode_value || '')}" /></td>
    <td><input type="text" class="v-sk" value="${escapeAttr(data.sku || '')}" /></td>
    <td><input type="text" class="v-sz" value="${escapeAttr(data.size || '')}" /></td>
    <td><input type="number" class="v-qty" min="1" max="9999" value="${Number(data.qty) || 1}" style="width:4rem" /></td>
    <td><button type="button" class="secondary rm">×</button></td>
  `;
  tr.querySelector('.rm').onclick = () => tr.remove();
  return tr;
}

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function readRows() {
  const out = [];
  document.querySelectorAll('#itemRows tr').forEach((tr) => {
    const barcode_value = tr.querySelector('.v-bc').value.trim();
    if (!barcode_value) return;
    out.push({
      barcode_value,
      sku: tr.querySelector('.v-sk').value.trim(),
      item_name: '',
      size: tr.querySelector('.v-sz').value.trim(),
      color: '',
      mrp: '',
      qty: parseInt(tr.querySelector('.v-qty').value, 10) || 1
    });
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

function setBatchInfo() {
  const el = document.getElementById('batchInfo');
  const prev = document.getElementById('btnPreview');
  const dl = document.getElementById('btnDownload');
  if (!batchId) {
    el.textContent = 'No active batch. Create one to add items.';
    prev.disabled = true;
    dl.style.display = 'none';
    return;
  }
  el.textContent = `Active batch #${batchId} — save items, then preview or download.`;
  prev.disabled = false;
  dl.href = apiUrl(`/batches/${batchId}/pdf`);
  dl.download = `labels-${batchId}.pdf`;
  dl.style.display = 'inline-block';
}

async function createOrLoadBatch() {
  const gmsg = document.getElementById('gmsg');
  gmsg.textContent = '';
  const template_id = document.getElementById('tpl').value;
  const name = document.getElementById('batchName').value.trim() || 'Batch';
  if (!template_id) {
    gmsg.textContent = 'Select a template.';
    return;
  }
  const b = await apiJson('/batches', {
    method: 'POST',
    body: JSON.stringify({ name, template_id: parseInt(template_id, 10) })
  });
  batchId = b.id;
  setBatchInfo();
  await refreshPreview();
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
  if (!batchId) return;
  const iframe = document.getElementById('pdfPreview');
  iframe.src = apiUrl(`/batches/${batchId}/pdf?inline=1&t=${Date.now()}`);
}

document.getElementById('btnCreateBatch').onclick = () =>
  createOrLoadBatch().catch((e) => {
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

document.getElementById('btnAddRow').onclick = () => {
  document.getElementById('itemRows').appendChild(rowEl({}));
};

document.getElementById('btnClearItems').onclick = () => {
  document.getElementById('itemRows').innerHTML = '';
};

document.getElementById('btnQuick').onclick = () => {
  const lines = document
    .getElementById('quickLines')
    .value.split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const tbody = document.getElementById('itemRows');
  lines.forEach((line) => {
    tbody.appendChild(rowEl({ barcode_value: line, sku: line, qty: 1 }));
  });
  document.getElementById('quickLines').value = '';
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
  } catch {
    /* ignore */
  }
}

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
  document.getElementById('itemRows').innerHTML = '';
  b.items.forEach((it) =>
    document.getElementById('itemRows').appendChild(
      rowEl({
        barcode_value: it.barcode_value,
        sku: it.sku,
        size: it.size,
        qty: it.qty
      })
    )
  );
  setBatchInfo();
  await refreshPreview();
}

document.getElementById('itemRows').appendChild(rowEl({}));

loadTemplates()
  .then(() => loadBatchFromQuery())
  .then(() => loadFromSession())
  .then(() => setBatchInfo())
  .catch((e) => {
    document.getElementById('gmsg').textContent = e.message;
  });
