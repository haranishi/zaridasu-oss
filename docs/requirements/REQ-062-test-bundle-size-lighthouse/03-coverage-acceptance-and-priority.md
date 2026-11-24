## カバレッジ目標
- 主要 5 ルート（`/`, `/admin/posts`, `/admin`, `/dashboard`, `/[...dynamic posts]`）のバンドルサイズを `.size-limit.json` に登録
- Lighthouse は `/` と `/dashboard` の 2 ルートを対象とする（管理画面は認証必須のため除外）

## テストデータ / フィクスチャ
- 回帰デモ用: `src/views/HomePage.tsx` の import に `import moment from 'moment'` を追加し、ビルド後 `/` の First Load JS が 300KB を超えることを確認（開発ブランチで手動検証）
- Lighthouse は CI 環境の CPU throttle を `settings.throttlingMethod = 'simulate'` に設定して安定化

## 受入条件
- [ ] AC-01: `npx size-limit` と `npx lhci autorun` が CI で通過し、通常 PR は green
- [ ] AC-02: ネガティブ検証 —
  - `src/views/HomePage.tsx` に意図的に `import 'moment'` を追加した PR では size-limit job が red
  - `/admin/posts` に大きな依存を加えると TC-01 が失敗
  - Lighthouse 用のホームページで意図的に巨大画像や大量 DOM を入れた PR で Lighthouse job が red
- [ ] AC-03: main ブランチで 3 回連続両ジョブが green（ベースライン安定確認）

## 影響範囲
- 新規: `.size-limit.json`, `.lighthouserc.json`
- 更新: `.github/workflows/ci.yml`（perf job 追加）or 新規 `.github/workflows/perf.yml`
- 新規 devDependency: `size-limit`, `@size-limit/file`, `@lhci/cli`（M サイズコスト）
- CI 実行時間: +3〜5 分（`npm run start` 起動 + Lighthouse 3 run）

## 優先度
Low（UX 回帰は痛いが、本番 GA4 / Search Console でも追跡可能。体制整備後に追加推奨）
