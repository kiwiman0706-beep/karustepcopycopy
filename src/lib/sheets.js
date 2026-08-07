// Google スプレッドシートから指定セルの内容を取得するユーティリティ。
//
// OAuth を使わず、gviz(Google Visualization API) の CSV 出力を利用する。
// 対象シートは「リンクを知っている全員が閲覧可」または「ウェブに公開」に
// しておく必要がある(カルステップが書き出す共有シートを想定)。

/** スプレッドシートURL / ID 文字列から spreadsheetId と gid を取り出す。 */
export function parseSheetRef(input) {
  if (!input) return null;
  const raw = input.trim();

  // 生のID(英数・ハイフン・アンダースコアのみ)がそのまま渡された場合
  if (/^[A-Za-z0-9_-]{20,}$/.test(raw)) {
    return { id: raw, gid: '0' };
  }

  const idMatch = raw.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]+)/);
  if (!idMatch) return null;
  const id = idMatch[1];

  let gid = '0';
  const gidMatch = raw.match(/[#&?]gid=([0-9]+)/);
  if (gidMatch) gid = gidMatch[1];
  return { id, gid };
}

/**
 * 単一セル(1個の値だけ)の CSV 文字列をアンエスケープする。
 * SOAP 本文は改行や引用符を含むため、"..."(内部の "" は ") を処理する。
 */
function parseSingleCellCsv(text) {
  if (text == null) return '';
  let s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  // 末尾の余分な改行を除去
  s = s.replace(/\n+$/, '');
  s = s.trim();
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) {
    s = s.slice(1, -1).replace(/""/g, '"');
  }
  return s;
}

/**
 * 指定セルの内容を取得する。
 * @param {string} sheetInput スプレッドシートのURLまたはID
 * @param {string} cell 例: "H2"
 * @returns {Promise<string>} セルの文字列
 */
export async function fetchCell(sheetInput, cell) {
  const ref = parseSheetRef(sheetInput);
  if (!ref) {
    throw new Error('スプレッドシートのURL/IDが正しくありません。');
  }
  const range = (cell || 'H2').trim().toUpperCase();
  const url =
    `https://docs.google.com/spreadsheets/d/${ref.id}/gviz/tq` +
    `?tqx=out:csv&gid=${encodeURIComponent(ref.gid)}` +
    `&range=${encodeURIComponent(range)}` +
    `&headers=0` +
    `&_ts=${Date.now()}`; // キャッシュ回避

  const res = await fetch(url, { credentials: 'omit', cache: 'no-store' });
  if (!res.ok) {
    if (res.status === 404 || res.status === 401 || res.status === 403) {
      throw new Error(
        'シートにアクセスできません。共有設定を「リンクを知っている全員(閲覧可)」にしてください。'
      );
    }
    throw new Error(`取得に失敗しました (HTTP ${res.status})`);
  }
  const text = await res.text();

  // ログインページ等のHTMLが返ってきた場合の検知
  if (/^\s*<(!doctype|html)/i.test(text)) {
    throw new Error(
      'シートにアクセスできません。共有設定(リンクを知っている全員)をご確認ください。'
    );
  }
  return parseSingleCellCsv(text);
}
