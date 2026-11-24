# REQ-100: Service Worker キャッシュバージョンの自動化

> 親 REQ: REQ-092（Web アプリ軽量化包括要件）

## 背景
ザリダスは PWA として `public/sw.js` を自前管理している。`CACHE_VERSION = 3`（`public/sw.js:3`）が **手動でインクリメントされる前提** の設計だが、リリース手順書にも明記されておらず、デプロイ時に更新を忘れるとユーザーが旧 HTML をキャッシュから読み続け「最新機能が反映されない」状態になる。

## 現状の問題
- `public/sw.js:3`：`const CACHE_VERSION = 3` が固定値
- `package.json` / リリースフローにバージョン bump スクリプトなし
- `next.config.ts` の headers で `/sw.js` を `no-cache` にしてはいるが、**ファイル内容が同一だとブラウザ側 SW が「変更なし」と判定して新インストールが走らない**
- 結果として「キャッシュバスティングが機能しない」リスクが本番で発火しうる

## 目的
SW のキャッシュバージョンをデプロイごとに自動で変える仕組みを入れ、リリース漏れによるキャッシュ事故を恒久的に潰す。

## 要件

### 機能要件
- [ ] FR-100-01: `public/sw.js` をテンプレート化し、ビルド時に `__CACHE_VERSION__` プレースホルダを置換する仕組みを導入する
  - 案 A: `next.config.ts` の `headers()` でレスポンスヘッダ経由ではなく、`scripts/build-sw.ts` を `prebuild` hook として実行し、`process.env.VERCEL_GIT_COMMIT_SHA || Date.now()` を文字列置換
  - 案 B: `next-pwa` または `@serwist/next` に移行し SW 生成自体を Next.js ビルドに任せる
- [ ] FR-100-02: 採用案を REQ にコミット（推奨は案 A の最小変更）
- [ ] FR-100-03: `package.json` の `scripts` に `prebuild`（または `build` 内チェイン）で SW テンプレート展開を組み込む
- [ ] FR-100-04: ローカル dev でも `npm run dev` 時に SW が更新されるよう `predev` も同様に処理（または dev 時は `CACHE_VERSION = 'dev'` で固定）

### 非機能要件
- [ ] NFR-100-01: ビルド時間の増加が +1 秒以内
- [ ] NFR-100-02: SW 内の他のロジック（offline fallback、isNetworkError）に影響しない
- [ ] NFR-100-03: Vercel Edge / CDN 側の `/sw.js` キャッシュは `no-cache, no-store, must-revalidate`（既存）を維持

## 受入条件
- [ ] AC-01: `npm run build` 後に `dist/sw.js`（または `public/sw.js` の処理結果）の `CACHE_VERSION` がコミット SHA かタイムスタンプになっている
- [ ] AC-02: 同じ git コミットで 2 回ビルドしても `CACHE_VERSION` が同じ（再現可能）
- [ ] AC-03: Vercel デプロイ後にブラウザで F5 すると `controllerchange` イベントが発火し、新しい SW が activate する
- [ ] AC-04: 旧キャッシュが `caches.delete` で消える（既存ロジック）
- [ ] AC-05: `git log` の差分で `CACHE_VERSION` 行の手動編集が発生しない

## 影響範囲
- `public/sw.js`（プレースホルダ化）
- `scripts/build-sw.ts`（新規 — 案 A 採用時）
- `package.json`（scripts 追加）
- `.gitignore`（生成成果物の追加が必要なら）
- `src/app/providers.tsx`（既存の SW 登録ロジックは無変更）

## 優先度
- **緊急度**: Critical
- **重要度**: High
- **理由**: 信頼性に直結。一度キャッシュ事故が起きるとユーザーが「壊れた」と認識して離脱。リリースフローの信頼性に関わる。

## 実装メモ
- 案 A の最小実装は 30 行程度の Node スクリプト：
  ```ts
  // scripts/build-sw.ts
  import { readFileSync, writeFileSync } from 'node:fs'
  const sha = process.env.VERCEL_GIT_COMMIT_SHA || String(Date.now())
  const tpl = readFileSync('public/sw.js.tpl', 'utf8')
  writeFileSync('public/sw.js', tpl.replaceAll('__CACHE_VERSION__', sha.slice(0, 8)))
  ```
- `public/sw.js.tpl` をテンプレートとし、`public/sw.js` を `.gitignore` 追加。
- 案 B（`@serwist/next`）は依存追加が大きいので REQ-100 では採用しない。将来の REQ で別途検討。
- Vercel ビルドでは `VERCEL_GIT_COMMIT_SHA` が自動で入る。ローカルは `Date.now()` でフォールバック。
