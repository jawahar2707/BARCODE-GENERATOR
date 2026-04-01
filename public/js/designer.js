/* global apiJson, apiUrl */

let currentId = null;

const sampleItem = () => ({
  sku: 'PNC533611M',
  barcode_value: 'PNC533611M',
  item_name: 'Sample',
  size: 'M',
  mrp: ''
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
    <div><label>&nbsp;</label><button type="button" class="secondary rm">Remove</button></div>
  `;
  el.querySelector('.bf').value = b.field || 'sku';
  el.querySelector('.bx').value = b.x_mm ?? 0;
  el.querySelector('.by').value = b.y_mm ?? 0;
  el.querySelector('.bfs').value = b.fontSizePt ?? 7;
  el.querySelector('.ba').value = b.align || 'left';
  el.querySelector('.rm').onclick = () => el.remove();
  return el;
}

function readBlocks() {
  const out = [];
  document.querySelectorAll('#blocks .row').forEach((row) => {
    out.push({
      type: 'text',
      field: row.querySelector('.bf').value,
      x_mm: parseFloat(row.querySelector('.bx').value) || 0,
      y_mm: parseFloat(row.querySelector('.by').value) || 0,
      fontSizePt: parseFloat(row.querySelector('.bfs').value) || 7,
      align: row.querySelector('.ba').value
    });
  });
  return out;
}

function writeBlocks(blocks) {
  const host = document.getElementById('blocks');
  host.innerHTML = '';
  (blocks || []).forEach((b, i) => host.appendChild(blockRow(b, i)));
}

function layoutFromForm() {
  return {
    barcode: {
      x_mm: parseFloat(document.getElementById('bcX').value) || 0,
      y_mm: parseFloat(document.getElementById('bcY').value) || 0,
      width_mm: parseFloat(document.getElementById('bcW').value) || 30,
      height_mm: parseFloat(document.getElementById('bcH').value) || 10,
      type: document.getElementById('bcType').value,
      sourceField: document.getElementById('srcField').value
    },
    blocks: readBlocks(),
    sheet: {
      cols: parseInt(document.getElementById('cols').value, 10) || 1,
      rows: parseInt(document.getElementById('rows').value, 10) || 1,
      hGap_mm: parseFloat(document.getElementById('hGap').value) || 0,
      vGap_mm: parseFloat(document.getElementById('vGap').value) || 0
    }
  };
}

function syncJsonTextarea() {
  document.getElementById('layoutJson').value = JSON.stringify(layoutFromForm(), null, 2);
}

function applyFormFromLayout(layout) {
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
  writeBlocks(layout.blocks || []);
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

async function runPreview() {
  const msg = document.getElementById('msg');
  msg.textContent = '';
  const layout = layoutFromForm();
  const body = {
    template: {
      width_mm: parseFloat(document.getElementById('wmm').value),
      height_mm: parseFloat(document.getElementById('hmm').value),
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
    const err = await r.json().catch(() => ({}));
    msg.textContent = err.error || r.statusText;
    return;
  }
  const blob = await r.blob();
  const iframe = document.getElementById('preview');
  iframe.src = URL.createObjectURL(blob);
}

document.getElementById('blocks').addEventListener('input', syncJsonTextarea);

document.getElementById('addBlock').onclick = () => {
  document.getElementById('blocks').appendChild(
    blockRow({ type: 'text', field: 'sku', x_mm: 5, y_mm: 14, fontSizePt: 7, align: 'left' }, 0)
  );
  syncJsonTextarea();
};

document.getElementById('btnApplyJson').onclick = () => {
  try {
    const layout = JSON.parse(document.getElementById('layoutJson').value);
    applyFormFromLayout(layout);
    document.getElementById('msg').textContent = '';
  } catch (e) {
    document.getElementById('msg').textContent = 'Invalid JSON: ' + e.message;
  }
};

['bcX', 'bcY', 'bcW', 'bcH', 'cols', 'rows', 'hGap', 'vGap', 'srcField', 'bcType'].forEach((id) => {
  document.getElementById(id).addEventListener('change', syncJsonTextarea);
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
syncJsonTextarea();

loadTemplateList().then(() => {
  const first = document.getElementById('tplSelect').options[1];
  if (first) {
    document.getElementById('tplSelect').value = first.value;
    document.getElementById('tplSelect').dispatchEvent(new Event('change'));
  }
});
