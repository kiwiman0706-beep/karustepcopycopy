// カルテ(CLIUS / M3デジカル 等)のページに注入されるコンテンツスクリプト。
//
// - ポップアップ/ショートカットからのメッセージで、SOAP本文を対象欄へ挿入する。
// - 「クリックで選択」モードで対象欄のセレクタを記録する。
// - React/Vue 等の制御コンポーネントでも値変更が検知されるよう、
//   ネイティブ setter + input/change イベントで書き込む。
//
// 同じタブに二重注入されても壊れないようにガードする。

(() => {
  if (window.__KARUSTEP_EMR__) return;
  window.__KARUSTEP_EMR__ = true;

  // ---- 要素判定・値書き込み ---------------------------------------------

  function isEditable(el) {
    if (!el) return false;
    if (el.disabled || el.readOnly) return false;
    if (el.tagName === 'TEXTAREA') return true;
    if (el.tagName === 'INPUT') {
      const t = (el.type || 'text').toLowerCase();
      return ['text', 'search', 'url', 'tel', 'email', ''].includes(t);
    }
    if (el.isContentEditable) return true;
    return false;
  }

  function nativeSetValue(el, value) {
    const proto =
      el.tagName === 'TEXTAREA'
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) {
      desc.set.call(el, value);
    } else {
      el.value = value;
    }
  }

  function fireInput(el) {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // el に text を書き込む。mode: 'replace' | 'append'
  function writeToElement(el, text, mode) {
    el.focus();

    if (el.isContentEditable) {
      if (mode === 'append') {
        // 末尾にキャレットを移動
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
        const prefix = el.textContent && !/\n$/.test(el.textContent) ? '\n' : '';
        if (!document.execCommand('insertText', false, prefix + text)) {
          el.textContent = (el.textContent || '') + prefix + text;
          fireInput(el);
        }
      } else {
        document.execCommand('selectAll', false, null);
        if (!document.execCommand('insertText', false, text)) {
          el.textContent = text;
          fireInput(el);
        }
      }
      fireInput(el);
      return true;
    }

    // input / textarea
    let next;
    if (mode === 'append' && el.value) {
      const sep = /\n$/.test(el.value) ? '' : '\n';
      next = el.value + sep + text;
    } else {
      next = text;
    }
    nativeSetValue(el, next);
    fireInput(el);
    // 末尾へキャレット
    try {
      el.selectionStart = el.selectionEnd = next.length;
    } catch (_) {}
    return true;
  }

  // ---- セレクタの生成・解決 ---------------------------------------------

  function buildSelector(el) {
    if (el.id && document.querySelectorAll(`#${CSS.escape(el.id)}`).length === 1) {
      return `#${CSS.escape(el.id)}`;
    }
    // name 属性
    if (el.name) {
      const byName = `${el.tagName.toLowerCase()}[name="${CSS.escape(el.name)}"]`;
      if (document.querySelectorAll(byName).length === 1) return byName;
    }
    // data-testid など
    for (const attr of ['data-testid', 'data-test', 'aria-label']) {
      const v = el.getAttribute && el.getAttribute(attr);
      if (v) {
        const s = `${el.tagName.toLowerCase()}[${attr}="${CSS.escape(v)}"]`;
        if (document.querySelectorAll(s).length === 1) return s;
      }
    }
    // 祖先をたどってパスを構築(:nth-of-type 付き)
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && node !== document.body) {
      let part = node.tagName.toLowerCase();
      if (node.id) {
        part = `#${CSS.escape(node.id)}`;
        parts.unshift(part);
        break;
      }
      const parent = node.parentElement;
      if (parent) {
        const sameTag = Array.from(parent.children).filter(
          (c) => c.tagName === node.tagName
        );
        if (sameTag.length > 1) {
          part += `:nth-of-type(${sameTag.indexOf(node) + 1})`;
        }
      }
      parts.unshift(part);
      node = node.parentElement;
    }
    return parts.join(' > ');
  }

  function resolveSelector(selector) {
    if (!selector) return null;
    try {
      const el = document.querySelector(selector);
      return isEditable(el) ? el : el; // 表示用途もあるのでそのまま返す
    } catch (_) {
      return null;
    }
  }

  function isVisible(el) {
    if (!el) return false;
    if (el.getClientRects().length === 0) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 20 && rect.height > 10;
  }

  // ---- 主要カルテの主訴所見欄（組み込み対応） --------------------------
  //
  // ホスト名で対象サービスを判定しつつ、要素の存在でもフォールバックする。
  // CLIUS / M3デジカル はどちらも主訴所見欄が TipTap(ProseMirror) の
  // contenteditable なので、フォーカス + execCommand('insertText') で挿入できる。
  const KNOWN_FIELDS = [
    {
      // CLIUS: https://web.clius.jp/
      host: /(^|\.)clius\.jp$/i,
      // 作成中カルテのSOAP(主訴所見)エディタ
      selectors: [
        'app-chart-soap .ProseMirror.wysiwyg-editor-content',
        'app-chart-soap .ProseMirror',
      ],
    },
    {
      // M3デジカル: https://digikar.jp/
      host: /(^|\.)digikar\.jp$/i,
      selectors: [
        '[data-diagnostic-impression-body] .ProseMirror.digikar-editor',
        '[data-diagnostic-impression-body] .ProseMirror',
        '.digikar-editor',
      ],
    },
  ];

  // ホストに関わらず試す汎用セレクタ(URLが変わった場合の保険)
  const GENERIC_FIELD_SELECTORS = [
    'app-chart-soap .ProseMirror',
    '[data-diagnostic-impression-body] .ProseMirror',
    '.digikar-editor',
  ];

  function firstEditableVisible(selectors) {
    for (const sel of selectors) {
      let list;
      try {
        list = document.querySelectorAll(sel);
      } catch (_) {
        continue;
      }
      for (const el of list) {
        if (isEditable(el) && isVisible(el)) return el;
      }
    }
    return null;
  }

  // 既知カルテの主訴所見欄を返す。
  function resolveKnownField() {
    const host = location.hostname;
    for (const site of KNOWN_FIELDS) {
      if (site.host.test(host)) {
        const el = firstEditableVisible(site.selectors);
        if (el) return el;
      }
    }
    // ホスト未一致でも要素の存在で拾う
    return firstEditableVisible(GENERIC_FIELD_SELECTORS);
  }

  // ---- 対象欄の自動検出 -------------------------------------------------

  // ラベル文字列から対象欄を推定する。
  const KEYWORDS = ['主訴', '所見', 'カルテ', '経過', 'SOAP', '記載', '診療', 'メモ'];

  function labelTextFor(el) {
    // <label for>, aria-label, placeholder, 近傍テキスト
    let text = '';
    if (el.id) {
      const lab = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (lab) text += ' ' + lab.textContent;
    }
    text += ' ' + (el.getAttribute('aria-label') || '');
    text += ' ' + (el.getAttribute('placeholder') || '');
    text += ' ' + (el.getAttribute('title') || '');
    // 親を数階層さかのぼってラベルらしきテキストを拾う
    let p = el.parentElement;
    for (let i = 0; i < 3 && p; i++) {
      const own = Array.from(p.childNodes)
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent)
        .join(' ');
      text += ' ' + own;
      p = p.parentElement;
    }
    return text;
  }

  function autoDetectField() {
    const candidates = Array.from(
      document.querySelectorAll('textarea, [contenteditable="true"], [contenteditable=""]')
    ).filter(isEditable);

    if (candidates.length === 0) return null;

    // キーワードにマッチするものを優先
    let best = null;
    let bestScore = -1;
    for (const el of candidates) {
      const rect = el.getBoundingClientRect();
      if (rect.width < 40 || rect.height < 16) continue; // 極小は除外
      const label = labelTextFor(el);
      let score = 0;
      for (const kw of KEYWORDS) if (label.includes(kw)) score += 2;
      score += Math.min(rect.width * rect.height, 200000) / 200000; // 大きい欄を優先
      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    }
    return best;
  }

  // ---- SOAP の分割 -----------------------------------------------------

  // "S) ..." "O) ..." のような節に分ける。無ければ null。
  function parseSoap(text) {
    const markers = [];
    // 行頭の "S)" "O:" "【A】" "#P" などを節の見出しとして検出する。
    const re = /(^|\n)[ \t　]*[#＃【]?[ \t　]*([SOAP])[ \t　]*[)）:：.．】][ \t　]*/gim;
    let m;
    while ((m = re.exec(text)) !== null) {
      markers.push({ letter: m[2].toUpperCase(), start: m.index + m[0].length, headStart: m.index });
    }
    if (markers.length < 2) return null;
    const out = {};
    for (let i = 0; i < markers.length; i++) {
      const cur = markers[i];
      const next = markers[i + 1];
      const body = text.slice(cur.start, next ? next.headStart : undefined).trim();
      out[cur.letter] = body;
    }
    return out;
  }

  // ---- 挿入処理 --------------------------------------------------------

  function findTargetForSlot(targets, slot) {
    if (targets && targets[slot]) {
      const el = resolveSelector(targets[slot]);
      if (el && isEditable(el)) return { el, via: 'saved' };
    }
    return null;
  }

  function doInsert({ text, mode, targets, splitSoap }) {
    if (!text || !text.trim()) {
      return { ok: false, error: '挿入するテキストが空です。' };
    }
    mode = mode || 'replace';
    const results = [];

    // SOAP分割 + S/O/A/P 個別欄が指定されている場合
    if (splitSoap && targets && (targets.S || targets.O || targets.A || targets.P)) {
      const soap = parseSoap(text);
      if (soap) {
        let any = false;
        for (const letter of ['S', 'O', 'A', 'P']) {
          if (!targets[letter] || soap[letter] == null) continue;
          const t = findTargetForSlot(targets, letter);
          if (t) {
            writeToElement(t.el, soap[letter], mode);
            results.push(letter);
            any = true;
          }
        }
        if (any) return { ok: true, detail: `SOAP分割挿入: ${results.join(', ')}` };
      }
      // 分割できなければ whole へフォールバック
    }

    // 単一欄への挿入(優先順)
    // 1) 保存済み whole セレクタ(ユーザーが明示登録した欄を最優先)
    let target = findTargetForSlot(targets, 'whole');
    // 2) 既知カルテ(CLIUS / M3デジカル)の主訴所見欄
    if (!target) {
      const el = resolveKnownField();
      if (el) target = { el, via: 'known' };
    }
    // 3) 現在フォーカス中の編集可能要素
    if (!target) {
      const ae = document.activeElement;
      if (isEditable(ae)) target = { el: ae, via: 'active' };
    }
    // 4) 汎用の自動検出
    if (!target) {
      const el = autoDetectField();
      if (el) target = { el, via: 'auto' };
    }
    if (!target) {
      return {
        ok: false,
        error:
          '挿入先の欄が見つかりませんでした。挿入したい欄をクリックしてカーソルを置くか、拡張機能の設定で「対象欄を選択」してください。',
      };
    }
    writeToElement(target.el, text, mode);
    const viaLabel = {
      saved: '保存済みの欄',
      known: '主訴所見欄',
      active: 'カーソル位置の欄',
      auto: '自動検出した欄',
    }[target.via];
    return { ok: true, detail: `挿入しました(${viaLabel})。` };
  }

  // ---- 「クリックで選択」モード ----------------------------------------

  let pickState = null;

  function highlight(el, on) {
    if (!el || !el.style) return;
    if (on) {
      el.dataset.__ksOutline = el.style.outline || '';
      el.style.outline = '3px solid #0d9488';
      el.style.outlineOffset = '1px';
    } else {
      el.style.outline = el.dataset.__ksOutline || '';
      delete el.dataset.__ksOutline;
    }
  }

  // 選択した対象欄をストレージへ保存する。
  // (ピック中はポップアップが閉じてしまうため、応答任せにせずここで永続化する)
  function persistTarget(slot, selector) {
    try {
      const origin = location.origin;
      chrome.storage.sync.get({ targets: {} }, (data) => {
        const targets = data.targets || {};
        targets[origin] = { ...(targets[origin] || {}), [slot]: selector };
        chrome.storage.sync.set({ targets });
      });
    } catch (_) {}
  }

  function toast(message) {
    const t = document.createElement('div');
    t.textContent = message;
    Object.assign(t.style, {
      position: 'fixed',
      bottom: '16px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: '2147483647',
      background: '#111827',
      color: '#fff',
      font: '13px/1.5 sans-serif',
      padding: '8px 14px',
      borderRadius: '8px',
      boxShadow: '0 2px 8px rgba(0,0,0,.35)',
    });
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2600);
  }

  function endPick(commit, el) {
    if (!pickState) return;
    document.removeEventListener('mousemove', pickState.onMove, true);
    document.removeEventListener('click', pickState.onClick, true);
    document.removeEventListener('keydown', pickState.onKey, true);
    if (pickState.hover) highlight(pickState.hover, false);
    if (pickState.banner) pickState.banner.remove();
    const resolve = pickState.resolve;
    const slot = pickState.slot;
    pickState = null;
    if (commit && el) {
      const selector = buildSelector(el);
      const label = (labelTextFor(el) || '').replace(/\s+/g, ' ').trim().slice(0, 40);
      persistTarget(slot, selector);
      toast(`挿入先を保存しました（${slot === 'whole' ? 'SOAP全文' : slot}）`);
      resolve({ ok: true, slot, selector, label });
    } else {
      resolve({ ok: false, cancelled: true, slot });
    }
  }

  function startPick(slot) {
    return new Promise((resolve) => {
      if (pickState) endPick(false);
      const banner = document.createElement('div');
      banner.textContent =
        `対象欄をクリックしてください（${slot === 'whole' ? 'SOAP全文' : slot}）　Escで中止`;
      Object.assign(banner.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        right: '0',
        zIndex: '2147483647',
        background: '#0d9488',
        color: '#fff',
        font: '14px/1.6 sans-serif',
        padding: '8px 12px',
        textAlign: 'center',
        boxShadow: '0 2px 6px rgba(0,0,0,.3)',
      });
      document.body.appendChild(banner);

      const onMove = (e) => {
        const el = e.target;
        if (pickState.hover === el) return;
        if (pickState.hover) highlight(pickState.hover, false);
        pickState.hover = isEditable(el) ? el : null;
        if (pickState.hover) highlight(pickState.hover, true);
      };
      const onClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const el = e.target;
        if (isEditable(el)) {
          endPick(true, el);
        } else {
          // 直近の編集可能な祖先/子を探す
          const near =
            el.closest('textarea,[contenteditable]') ||
            el.querySelector('textarea,[contenteditable]');
          if (near && isEditable(near)) endPick(true, near);
        }
      };
      const onKey = (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          endPick(false);
        }
      };
      document.addEventListener('mousemove', onMove, true);
      document.addEventListener('click', onClick, true);
      document.addEventListener('keydown', onKey, true);
      pickState = { slot, resolve, onMove, onClick, onKey, banner, hover: null };
    });
  }

  // ---- メッセージ受信 --------------------------------------------------

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || !msg.type) return;
    if (msg.type === 'KS_PING') {
      sendResponse({ ok: true });
      return;
    }
    if (msg.type === 'KS_INSERT') {
      sendResponse(doInsert(msg));
      return;
    }
    if (msg.type === 'KS_PICK') {
      startPick(msg.slot || 'whole').then(sendResponse);
      return true; // 非同期応答
    }
    if (msg.type === 'KS_PROBE') {
      const el = resolveKnownField() || autoDetectField();
      sendResponse({
        ok: true,
        detected: el ? buildSelector(el) : null,
        known: !!resolveKnownField(),
        editableCount: document.querySelectorAll('textarea,[contenteditable]').length,
        origin: location.origin,
      });
      return;
    }
  });
})();
