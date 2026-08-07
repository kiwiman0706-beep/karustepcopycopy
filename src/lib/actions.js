// ポップアップとバックグラウンドで共有する処理層。
import { fetchCell } from './sheets.js';

export const DEFAULT_CONFIG = {
  sheetUrl: '',
  cell: 'H2',
  source: 'sheet', // 'sheet' | 'clipboard'
  insertMode: 'replace', // 'replace' | 'append'
  splitSoap: false,
  targets: {}, // { [origin]: { whole, S, O, A, P } }
};

export async function getConfig() {
  const stored = await chrome.storage.sync.get(DEFAULT_CONFIG);
  return { ...DEFAULT_CONFIG, ...stored };
}

export async function setConfig(patch) {
  const cur = await getConfig();
  const next = { ...cur, ...patch };
  await chrome.storage.sync.set(next);
  return next;
}

export async function saveTarget(origin, slot, selector) {
  const cur = await getConfig();
  const targets = { ...(cur.targets || {}) };
  targets[origin] = { ...(targets[origin] || {}), [slot]: selector };
  await chrome.storage.sync.set({ targets });
  return targets[origin];
}

export async function clearTargets(origin) {
  const cur = await getConfig();
  const targets = { ...(cur.targets || {}) };
  delete targets[origin];
  await chrome.storage.sync.set({ targets });
}

// SOAP本文をシートから取得する(source='sheet')。
export async function fetchTextFromSheet(config) {
  if (!config.sheetUrl) {
    throw new Error('スプレッドシートのURLが未設定です。拡張機能の設定で登録してください。');
  }
  const text = await fetchCell(config.sheetUrl, config.cell);
  if (!text || !text.trim()) {
    throw new Error(`セル ${config.cell} が空です。カルステップの書き出しをご確認ください。`);
  }
  return text;
}

// アクティブタブを取得。
export async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

function isInjectableUrl(url) {
  if (!url) return false;
  return /^https?:|^file:/.test(url) && !url.startsWith('https://chrome.google.com/webstore');
}

// 対象タブにコンテンツスクリプトを(未注入なら)注入する。
export async function ensureInjected(tabId) {
  try {
    const res = await chrome.tabs.sendMessage(tabId, { type: 'KS_PING' });
    if (res && res.ok) return true;
  } catch (_) {
    // 未注入
  }
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['src/content/emr.js'],
  });
  return true;
}

// タブへメッセージを送る(注入込み)。
export async function sendToTab(tabId, message) {
  await ensureInjected(tabId);
  return chrome.tabs.sendMessage(tabId, message);
}

// SOAP を対象タブのカルテ欄へ挿入する。
export async function insertIntoTab(tab, text, config) {
  if (!tab || !isInjectableUrl(tab.url)) {
    throw new Error('このページには挿入できません。カルテ(CLIUS/M3デジカル等)の画面を開いてください。');
  }
  const origin = new URL(tab.url).origin;
  const targets = (config.targets && config.targets[origin]) || {};
  const res = await sendToTab(tab.id, {
    type: 'KS_INSERT',
    text,
    mode: config.insertMode,
    splitSoap: config.splitSoap,
    targets,
  });
  if (!res || !res.ok) {
    throw new Error((res && res.error) || '挿入に失敗しました。');
  }
  return res;
}

// クリップボードへ書き込む(アクティブタブ内で実行)。
export async function copyToClipboardViaTab(tab, text) {
  if (!tab || !isInjectableUrl(tab.url)) {
    throw new Error('このページではコピーできません。');
  }
  const [{ result } = {}] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: async (t) => {
      try {
        await navigator.clipboard.writeText(t);
        return true;
      } catch (e) {
        // フォールバック
        const ta = document.createElement('textarea');
        ta.value = t;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        return ok;
      }
    },
    args: [text],
  });
  if (!result) throw new Error('クリップボードへのコピーに失敗しました。');
  return true;
}
