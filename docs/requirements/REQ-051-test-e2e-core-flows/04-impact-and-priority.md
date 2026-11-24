## 影響範囲
- 新規ディレクトリ: `tests/e2e/` 配下（`homepage.spec.ts` / `post-create.spec.ts` / `admin-approve.spec.ts` / `error-boundary.spec.ts`、`auth.setup.ts`、`helpers/db.ts`）
- 新規ファイル: `playwright.config.ts`（ルート直下）、`supabase/seed/e2e_seed.sql`
- `package.json`: `@playwright/test` / `@axe-core/playwright` を devDependencies に追加、`scripts.test:e2e` を追加
- CI: `.github/workflows/ci.yml` に Supabase CLI セットアップ + Next.js ビルド + `playwright install chromium` + `npx playwright test` ジョブを追加
- 既存アプリコードは変更なし

## 優先度
- **緊急度**: 中〜高
- **重要度**: Critical
- **理由**: 投入コストは大きい（Playwright インフラ整備）が、クロスレイヤー回帰（middleware × RLS × Server Component × Leaflet）は他のテスト手法で検知できない。4 フローに絞ることで回帰価値あたりのコストを最小化する。
