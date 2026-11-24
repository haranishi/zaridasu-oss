## 0. 要件サマリー

ザリダスは「屋外の水辺で現地から投稿する市民参加型アプリ」であり、PWAインストールとオフライン投稿がプロダクトの前提である。しかし配信側の実測では、

1. 配信HTMLの `<link rel="manifest">` が **404**（A2HS・standalone・shortcuts・maskable icon が全て無効）
2. iOS Safari の**オフライン時にオフライン画面が出ない**（判定文字列の不一致）
3. オフラインでコールドスタートすると**オフライン下書き保存機能に一度も到達できない**（HTMLを一切キャッシュしていない）

という3点が重なり、**PWAとしての導線が実質丸ごと死んでいる**。加えてデプロイ毎に全ユーザーのキャッシュが空になり、投稿フォーム記入中のタブが強制リロードされる。

本要件は「配信物としてのPWA」を成立させるための最小修復（manifest 1行）から、オフライン到達性の回復、キャッシュ戦略の分離、オフライン画面の多言語化、送信中スタック下書きの救出までを扱う。

## 背景

### 問題A: 配信HTMLの manifest リンクが404で、PWAインストール導線が丸ごと無効 — High

`src/app/layout.tsx:51` は `manifest: '/manifest.json'` を指定している。一方 manifest の実体は App Router の `src/app/manifest.ts`（`MetadataRoute.Manifest`）であり、Next.js が生成・配信するパスは **`/manifest.webmanifest`** である。

- `public/manifest.json` は**存在しない**
- `next.config.ts` に `rewrites` は **0件**（`/manifest.json` → `/manifest.webmanifest` の書き換えも無い）

したがって配信HTMLの `<link rel="manifest" href="/manifest.json">` は **404** を返す。結果として `src/app/manifest.ts` が定義している以下がすべてブラウザに読まれない。

| 定義 | 実際の効果 |
|---|---|
| `display: 'standalone'` | 無効（ブラウザUI付きで起動） |
| `theme_color: '#dc2626'` | 無効（`viewport.themeColor` の meta は別途出るため一部は残る） |
| `icons`（PNG 192/512・maskable） | 無効 |
| `shortcuts`（`/?action=post`・`/dashboard`） | 無効 |
| `start_url` / `scope` / `categories` | 無効 |

A2HS（ホーム画面に追加）のインストール可能条件そのものが満たされないため、`InstallBanner`（`src/app/providers.tsx`）が案内するインストールも成立しない。

**この故障はCIで検知されない。** `.lighthouserc.json` の `assert` は `lighthouse:recommended` プリセット＋個別assertionのみで、`installable-manifest` / `maskable-icon` / `splash-screen` 等のmanifest系assertionを明示していない。E2E（`tests/e2e/` 9ファイル）にも manifest を取得する検証は無い。

**修正そのものは1行**（`layout.tsx:51`）だが、影響範囲は「市民参加型アプリのPWAインストール導線が全滅」であり、REQ-276（manifest に `screenshots` / `id` を追加してリッチインストールUIを出す）は**この1行が直るまで一切効果を持たない**。
