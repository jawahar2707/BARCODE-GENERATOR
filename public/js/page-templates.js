/* global apiJson, apiUrl */

let ptId = null;

function showMsg(text, ok) {
  const el = document.getElementById('ptmsg');
  el.textContent = text || '';
  el.className = ok ? 'ok' : 'err';
}

async function loadList() {
  const list = await apiJson('/page-templates');
  const sel = document.getElementById('ptSelect');
  const cur = sel.value;
  sel.innerHTML = '<option value="">— New page layout —</option>';
  list.forEach((t) => {
    const o = document.createElement('option');
    o.value = t.id;
    o.textContent = t.name;
    sel.appendChild(o);
  });
  if (cur) sel.value = cur;
}

function fillForm(t) {
  ptId = t ? t.id : null;
  document.getElementById('ptName').value = t ? t.name : '';
  document.getElementById('pw').value = t ? t.page_width_mm : 210;
  document.getElementById('ph').value = t ? t.page_height_mm : 297;
  if (t) {
    document.getElementById('hdrJson').value = JSON.stringify(t.header_regions || [], null, 2);
    document.getElementById('gridJson').value = JSON.stringify(t.label_grid || {}, null, 2);
    document.getElementById('dynJson').value = JSON.stringify(t.dynamic_fields || [], null, 2);
  } else {
    document.getElementById('hdrJson').value = '[]';
    document.getElementById('gridJson').value = '{}';
    document.getElementById('dynJson').value = '[]';
  }
}

document.getElementById('btnPreset').onclick = async () => {
  try {
    const { preset } = await apiJson('/page-templates/preset/tafeeta');
    document.getElementById('hdrJson').value = JSON.stringify(preset.header_regions, null, 2);
    document.getElementById('gridJson').value = JSON.stringify(preset.label_grid, null, 2);
    document.getElementById('dynJson').value = JSON.stringify(preset.dynamic_fields, null, 2);
    document.getElementById('pw').value = 210;
    document.getElementById('ph').value = 297;
    showMsg('Preset loaded — tweak mm values to match your exported image, then Save.', true);
  } catch (e) {
    showMsg(e.message);
  }
};

document.getElementById('btnSavePt').onclick = async () => {
  showMsg('');
  let header_regions;
  let label_grid;
  let dynamic_fields;
  try {
    header_regions = JSON.parse(document.getElementById('hdrJson').value || '[]');
    label_grid = JSON.parse(document.getElementById('gridJson').value || '{}');
    dynamic_fields = JSON.parse(document.getElementById('dynJson').value || '[]');
  } catch (e) {
    showMsg('Invalid JSON: ' + e.message);
    return;
  }
  const payload = {
    name: document.getElementById('ptName').value.trim() || 'Untitled page',
    page_width_mm: parseFloat(document.getElementById('pw').value),
    page_height_mm: parseFloat(document.getElementById('ph').value),
    header_regions,
    label_grid,
    dynamic_fields
  };
  try {
    let res;
    if (ptId) {
      res = await apiJson('/page-templates/' + ptId, {
        method: 'PUT',
        body: JSON.stringify({ ...payload, id: ptId })
      });
    } else {
      res = await apiJson('/page-templates', { method: 'POST', body: JSON.stringify(payload) });
      ptId = res.id;
    }
    await loadList();
    document.getElementById('ptSelect').value = String(res.id);
    showMsg('Saved. Upload your page PNG/JPEG if you have not yet.', true);
  } catch (e) {
    showMsg(e.message);
  }
};

document.getElementById('btnUploadBg').onclick = async () => {
  if (!ptId) {
    showMsg('Save the page layout first, then upload the image.');
    return;
  }
  const input = document.getElementById('ptFile');
  if (!input.files || !input.files[0]) {
    showMsg('Choose a PNG or JPEG file.');
    return;
  }
  const fd = new FormData();
  fd.append('file', input.files[0]);
  showMsg('');
  try {
    const r = await fetch(apiUrl('/page-templates/' + ptId + '/background'), { method: 'POST', body: fd });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || r.statusText);
    showMsg('Background uploaded: ' + data.background_image_path, true);
    input.value = '';
    await loadList();
  } catch (e) {
    showMsg(e.message);
  }
};

document.getElementById('btnDelPt').onclick = async () => {
  if (!ptId || !confirm('Delete this page layout?')) return;
  try {
    await apiJson('/page-templates/' + ptId, { method: 'DELETE' });
    ptId = null;
    document.getElementById('ptSelect').value = '';
    fillForm(null);
    await loadList();
    showMsg('Deleted.', true);
  } catch (e) {
    showMsg(e.message);
  }
};

document.getElementById('ptSelect').onchange = async () => {
  const v = document.getElementById('ptSelect').value;
  if (!v) {
    ptId = null;
    fillForm(null);
    return;
  }
  const t = await apiJson('/page-templates/' + v);
  fillForm(t);
};

loadList().catch((e) => showMsg(e.message));
