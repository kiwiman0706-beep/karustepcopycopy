#!/usr/bin/env bash
# CRX(CRX3) をパッケージするスクリプト。
#
# 使い方:
#   tools/pack.sh /path/to/key.pem
#
# - manifest.json の version を読み、dist/karustep-clius-<version>.crx を出力します。
# - 署名鍵(key.pem)はIDを固定するため初回と同じものを使い続けてください。
# - key.pem はリポジトリに含めないこと(.gitignore で除外済み)。
set -euo pipefail

KEY="${1:-}"
if [ -z "$KEY" ] || [ ! -f "$KEY" ]; then
  echo "usage: tools/pack.sh /path/to/key.pem" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VERSION=$(python3 -c "import json;print(json.load(open('manifest.json'))['version'])")
BUILD="$(mktemp -d)"
trap 'rm -rf "$BUILD"' EXIT

# 拡張本体のみをコピー(docs, tools, dist, .git は含めない)
cp -r manifest.json src icons "$BUILD/"

# Chrome/Chromium を探す
CHROME=""
for c in "${CHROME_BIN:-}" \
         /opt/pw-browsers/chromium-*/chrome-linux/chrome \
         "$(command -v google-chrome || true)" \
         "$(command -v chromium || true)" \
         "$(command -v chromium-browser || true)" \
         "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"; do
  if [ -n "$c" ] && [ -x "$c" ]; then CHROME="$c"; break; fi
done

mkdir -p dist
OUT="dist/karustep-clius-${VERSION}.crx"

if [ -n "$CHROME" ]; then
  "$CHROME" --pack-extension="$BUILD" --pack-extension-key="$KEY" --no-sandbox --headless=new >/dev/null 2>&1 || true
  mv "${BUILD}.crx" "$OUT"
elif command -v npx >/dev/null 2>&1; then
  npx --yes crx3 "$BUILD" -p "$KEY" -o "$OUT"
else
  echo "Chrome/Chromium も npx も見つかりません。どちらかを用意してください。" >&2
  exit 1
fi

echo "packed: $OUT (version $VERSION)"
echo "次に dist/updates.xml の codebase と version を $VERSION に更新してください。"
