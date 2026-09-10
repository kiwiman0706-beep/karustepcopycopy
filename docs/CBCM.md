# CBCM 配布ガイド（自己ホスト強制インストール）

この拡張機能を Chrome Browser Cloud Management（CBCM / Google 管理コンソール）で
**強制インストール**するための情報一式です。Chrome ウェブストアは経由せず、
本リポジトリでホストした CRX と更新マニフェスト（updates.xml）を使う自己ホスト配布です。

## リリース情報（v1.0.0）

| 項目 | 値 |
|------|----|
| **拡張機能ID** | `fammeendkeciopghdknckdjmdbihnono` |
| **バージョン** | `1.0.0` |
| **更新URL (update_url)** | `https://raw.githubusercontent.com/kiwiman0706-beep/karustepcopycopy/claude/chrome-extension-clius-integration-rmlwwm/dist/updates.xml` |
| **CRX** | `https://raw.githubusercontent.com/kiwiman0706-beep/karustepcopycopy/claude/chrome-extension-clius-integration-rmlwwm/dist/karustep-clius-1.0.0.crx` |

> 拡張機能IDは `manifest.json` の `key`（公開鍵）から決定的に導出されます。
> 署名鍵を変えない限り、以降のバージョンでもIDは同じです。

> URLはこのブランチ（`claude/chrome-extension-clius-integration-rmlwwm`＝現在の既定ブランチ）
> を指しています。ブランチ名を変更・マージした場合は、`dist/updates.xml` の `codebase` と
> 下記の update_url のブランチ部分を合わせて更新してください。

## CBCM での設定手順

### A. 管理コンソールのUIから（推奨）

1. [管理コンソール](https://admin.google.com) → **Chrome** → **アプリと拡張機能** →
   **ユーザーとブラウザ**（配布したい組織部門を選択）。
2. 右下の **＋** →「**URL でカスタムアプリを追加**」（Add Chrome app or extension by URL）。
3. **拡張機能ID** に `fammeendkeciopghdknckdjmdbihnono`、
   **URL（update_url）** に上記の updates.xml のURLを入力して追加。
4. 追加された拡張機能のインストールポリシーを「**強制インストール**」に設定して保存。

### B. ポリシー値で設定する場合

**ExtensionInstallForcelist**（1エントリ）:

```
fammeendkeciopghdknckdjmdbihnono;https://raw.githubusercontent.com/kiwiman0706-beep/karustepcopycopy/claude/chrome-extension-clius-integration-rmlwwm/dist/updates.xml
```

または **ExtensionSettings**（JSON、細かく制御したい場合）:

```json
{
  "fammeendkeciopghdknckdjmdbihnono": {
    "installation_mode": "force_installed",
    "update_url": "https://raw.githubusercontent.com/kiwiman0706-beep/karustepcopycopy/claude/chrome-extension-clius-integration-rmlwwm/dist/updates.xml"
  }
}
```

## 動作確認

- 対象PCで `chrome://policy` を開き、上記ポリシーが反映されているか確認
  （「ポリシーを再読み込み」）。
- `chrome://extensions`（デベロッパーモード）で拡張機能ID
  `fammeendkeciopghdknckdjmdbihnono` が「ポリシーによりインストール」で
  入っていることを確認。
- 反映されない場合は数分待つ、またはブラウザ再起動。GitHub raw は数分の
  キャッシュがあります。

## バージョンアップの手順

1. `manifest.json` の `version` を上げる（例 `1.0.1`）。`key` はそのまま（IDを固定）。
2. 新しい CRX をパッケージする（下記「再パッケージ」）。
   出力を `dist/karustep-clius-<新バージョン>.crx` として配置。
3. `dist/updates.xml` の `codebase`（CRXファイル名）と `version` を新バージョンに更新。
4. コミット＆プッシュ。CBCM 側の設定変更は不要——Chrome が updates.xml を
   定期的にポーリングし、自動で更新します。

## 再パッケージ（CRXの作り方）

**署名鍵 `key.pem` が必須**です（IDを固定するため、初回と同じ鍵を使い続けます）。
`key.pem` はこのリポジトリには含めていません（`.gitignore` で除外）。
初回リリース時に別途お渡しした鍵を安全な場所に保管し、それを使ってください。

```bash
# 例: Chrome/Chromium の --pack-extension を使う
#   拡張本体(manifest.json, src/, icons/)だけを含む build ディレクトリを作って渡す
tools/pack.sh /path/to/key.pem
```

`tools/pack.sh` は build ディレクトリを作って Chrome でパッケージし、
`dist/` に CRX を出力します。Chrome が無い環境では
`npx crx3 build -p key.pem -o dist/karustep-clius-<version>.crx` でも作成できます。

## 秘密鍵（key.pem）の取り扱い ⚠️

- `key.pem` は拡張機能の**署名鍵**です。**絶対にリポジトリや公開場所に置かないでください。**
- 紛失すると同一IDでの更新ができなくなります（新IDでの再配布が必要）。
- 漏洩すると第三者が同一IDの偽CRXを作れてしまいます。安全に保管してください。
</content>
