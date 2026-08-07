import { getConfig, setConfig, clearTargets } from './lib/actions.js';
import { fetchCell } from './lib/sheets.js';

const $ = (id) => document.getElementById(id);

let savedTimer = null;
function flashSaved() {
  const el = $('saved');
  el.hidden = false;
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => (el.hidden = true), 1200);
}

function radios(name) {
  return Array.from(document.querySelectorAll(`input[name="${name}"]`));
}
function getRadio(name) {
  const c = radios(name).find((r) => r.checked);
  return c ? c.value : null;
}
function setRadio(name, value) {
  radios(name).forEach((r) => (r.checked = r.value === value));
}

function toggleSheetFields() {
  const isSheet = getRadio('source') === 'sheet';
  $('sheetFields').style.opacity = isSheet ? '1' : '.5';
  $('sheetFields').style.pointerEvents = isSheet ? 'auto' : 'none';
}

async function save() {
  await setConfig({
    sheetUrl: $('sheetUrl').value.trim(),
    cell: ($('cell').value.trim() || 'H2').toUpperCase(),
    source: getRadio('source') || 'sheet',
    insertMode: getRadio('insertMode') || 'replace',
    splitSoap: $('splitSoap').checked,
  });
  toggleSheetFields();
  flashSaved();
}

async function renderTargets() {
  const config = await getConfig();
  const box = $('targets');
  box.innerHTML = '';
  const origins = Object.keys(config.targets || {});
  if (origins.length === 0) {
    box.innerHTML = '<p class="hint">まだ登録されていません。</p>';
    return;
  }
  for (const origin of origins) {
    const t = config.targets[origin] || {};
    const slots = ['whole', 'S', 'O', 'A', 'P']
      .filter((s) => t[s])
      .map((s) => (s === 'whole' ? '全文' : s))
      .join(' / ');
    const row = document.createElement('div');
    row.className = 'target-row';
    const info = document.createElement('div');
    info.innerHTML = `<div>${origin}</div><div class="slots">挿入先: ${slots || '-'}</div>`;
    const btn = document.createElement('button');
    btn.textContent = '削除';
    btn.addEventListener('click', async () => {
      await clearTargets(origin);
      renderTargets();
    });
    row.append(info, btn);
    box.appendChild(row);
  }
}

async function onTest() {
  const preview = $('preview');
  preview.hidden = false;
  preview.className = 'preview';
  preview.textContent = '取得中…';
  try {
    const url = $('sheetUrl').value.trim();
    const cell = ($('cell').value.trim() || 'H2').toUpperCase();
    const text = await fetchCell(url, cell);
    preview.textContent = text
      ? `【${cell} の内容】\n\n${text}`
      : `セル ${cell} は空でした。`;
  } catch (e) {
    preview.className = 'preview err';
    preview.textContent = e.message || String(e);
  }
}

async function init() {
  const config = await getConfig();
  $('sheetUrl').value = config.sheetUrl || '';
  $('cell').value = config.cell || 'H2';
  setRadio('source', config.source || 'sheet');
  setRadio('insertMode', config.insertMode || 'replace');
  $('splitSoap').checked = !!config.splitSoap;
  toggleSheetFields();
  await renderTargets();

  ['sheetUrl', 'cell'].forEach((id) => $(id).addEventListener('change', save));
  radios('source').forEach((r) => r.addEventListener('change', save));
  radios('insertMode').forEach((r) => r.addEventListener('change', save));
  $('splitSoap').addEventListener('change', save);
  $('test').addEventListener('click', onTest);

  // 別画面での対象欄変更を反映
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.targets) renderTargets();
  });
}

init();
