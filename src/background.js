// バックグラウンド(サービスワーカー)。
// キーボードショートカットのコマンドを処理する。
import {
  getConfig,
  getActiveTab,
  fetchTextFromSheet,
  insertIntoTab,
  copyToClipboardViaTab,
} from './lib/actions.js';

// 通知の代わりにバッジで簡易フィードバック。
async function flashBadge(text, color) {
  try {
    await chrome.action.setBadgeBackgroundColor({ color: color || '#0d9488' });
    await chrome.action.setBadgeText({ text });
    setTimeout(() => chrome.action.setBadgeText({ text: '' }), 2500);
  } catch (_) {}
}

async function handleInsert() {
  const config = await getConfig();
  const tab = await getActiveTab();
  const text = await fetchTextFromSheet(config);
  await insertIntoTab(tab, text, config);
  await flashBadge('OK', '#0d9488');
}

async function handleCopy() {
  const config = await getConfig();
  const tab = await getActiveTab();
  const text = await fetchTextFromSheet(config);
  await copyToClipboardViaTab(tab, text);
  await flashBadge('OK', '#0d9488');
}

chrome.commands.onCommand.addListener(async (command) => {
  try {
    if (command === 'insert-to-emr') await handleInsert();
    else if (command === 'copy-to-clipboard') await handleCopy();
  } catch (e) {
    console.error('[karustep]', command, e);
    await flashBadge('ERR', '#dc2626');
  }
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.runtime.openOptionsPage();
  }
});
