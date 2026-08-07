import {
  getConfig,
  getActiveTab,
  fetchTextFromSheet,
  insertIntoTab,
  copyToClipboardViaTab,
  sendToTab,
  clearTargets,
} from './lib/actions.js';

const $ = (id) => document.getElementById(id);
const statusEl = $('status');

function setStatus(msg, kind) {
  statusEl.textContent = msg || '';
  statusEl.className = 'status' + (kind ? ' ' + kind : '');
}

function busy(on) {
  $('insert').disabled = on;
  $('copy').disabled = on;
}

let currentTab = null;
let currentOrigin = null;

// source に応じて SOAP テキストを取得する。
async function resolveText(config) {
  if (config.source === 'clipboard') {
    try {
      const t = await navigator.clipboard.readText();
      if (!t || !t.trim()) {
        throw new Error('クリップボードが空です。先にカルステップでコピーしてください。');
      }
      return t;
    } catch (e) {
      throw new Error('クリップボードを読み取れませんでした: ' + (e.message || e));
    }
  }
  return fetchTextFromSheet(config);
}

async function onInsert() {
  busy(true);
  setStatus('取得中…', 'busy');
  try {
    const config = await getConfig();
    const text = await resolveText(config);
    setStatus('挿入中…', 'busy');
    const res = await insertIntoTab(currentTab, text, config);
    setStatus(res.detail || '挿入しました。', 'ok');
  } catch (e) {
    setStatus(e.message || String(e), 'err');
  } finally {
    busy(false);
  }
}

async function onCopy() {
  busy(true);
  setStatus('取得中…', 'busy');
  try {
    const config = await getConfig();
    const text = await resolveText(config);
    // ポップアップから直接コピー(ユーザー操作直後で許可される)
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {
      await copyToClipboardViaTab(currentTab, text);
    }
    setStatus('クリップボードにコピーしました。', 'ok');
  } catch (e) {
    setStatus(e.message || String(e), 'err');
  } finally {
    busy(false);
  }
}

// slot の対象欄を選択する。ピック開始後ポップアップは閉じるため、
// 保存はコンテンツスクリプト側で行う(persistTarget)。ここでは開始のみ。
async function onPick(slot) {
  if (!currentTab) return;
  setStatus('対象欄をクリックしてください（この画面は閉じます）', 'busy');
  try {
    await sendToTab(currentTab.id, { type: 'KS_PICK', slot });
    // ここへ到達するのはユーザーがポップアップを閉じずに選択/中止した場合のみ。
    await refreshTargetState();
  } catch (e) {
    setStatus('選択を開始できませんでした: ' + (e.message || e), 'err');
  }
}

async function renderPickButtons() {
  const config = await getConfig();
  const box = $('pickSlots');
  box.innerHTML = '';
  const slots = config.splitSoap
    ? [['whole', '全文'], ['S', 'S'], ['O', 'O'], ['A', 'A'], ['P', 'P']]
    : [['whole', '対象欄を選択']];
  for (const [slot, label] of slots) {
    const b = document.createElement('button');
    b.className = 'mini';
    b.textContent = config.splitSoap && slot !== 'whole' ? `${label}欄` : label;
    b.addEventListener('click', () => onPick(slot));
    box.appendChild(b);
  }
}

async function onClear() {
  if (!currentOrigin) return;
  await clearTargets(currentOrigin);
  setStatus('このサイトの挿入先を解除しました。', 'ok');
  await refreshTargetState();
}

async function refreshTargetState() {
  const config = await getConfig();
  const t = (config.targets && config.targets[currentOrigin]) || {};
  const slots = ['whole', 'S', 'O', 'A', 'P'].filter((s) => t[s]);
  $('targetState').textContent = slots.length
    ? slots.map((s) => (s === 'whole' ? '全文' : s)).join(' / ')
    : '未設定(自動検出)';
}

async function init() {
  currentTab = await getActiveTab();
  const config = await getConfig();
  $('srcinfo').textContent =
    (config.source === 'clipboard' ? 'ソース: クリップボード' : 'ソース: シート ' + (config.cell || 'H2'));

  if (currentTab && /^https?:/.test(currentTab.url || '')) {
    try {
      currentOrigin = new URL(currentTab.url).origin;
    } catch (_) {}
  }
  if (!currentOrigin) {
    $('targetState').textContent = '対象外のページ';
    $('clear').disabled = true;
    $('insert').disabled = true;
  } else {
    await refreshTargetState();
    await renderPickButtons();
  }

  if (config.source === 'sheet' && !config.sheetUrl) {
    setStatus('スプレッドシートURLが未設定です。「設定」から登録してください。', 'err');
  }

  $('insert').addEventListener('click', onInsert);
  $('copy').addEventListener('click', onCopy);
  $('clear').addEventListener('click', onClear);
  $('opts').addEventListener('click', () => chrome.runtime.openOptionsPage());
}

init();
