## 背景
現状、ホーム／投稿／管理承認／エラー境界 の各フローは Server Components・Client Components・Supabase RLS・Middleware を跨いで協調して動くが、これら統合挙動を確認するテストが一切存在しない。個別ユニット／結合テストが通っても「ホーム画面で地図ピンを押してもモーダルが開かない」「admin 承認後に public 投稿ページが 404 のまま」といったクロスレイヤー回帰は検知できない。本要件では Playwright による最小限のスモーク E2E 4 本を導入し、主要フローの回帰を CI で止める防壁を築く。

## 守りたい不変条件
- **INV-01**: 未ログインでトップ `/` にアクセス → Leaflet 地図が描画される（`.leaflet-container` が DOM に存在・可視）→ 任意の既存投稿ピンをクリック → 詳細モーダル／ポップアップが表示される
- **INV-02**: 認証済み一般ユーザーが `/` の投稿モーダルを開き、species=アメリカザリガニ・info_type=目撃・秋田県内（lat=39.7, lng=140.1）・comment を入力して submit → `pending` として DB に保存 → 投稿者自身のダッシュボード or ホーム上に表示される
- **INV-03**: admin ユーザーが `/admin/posts` で pending 投稿を「承認」ボタン押下 → 成功トースト表示 → `/post/<id>` を未ログインで開くと `status='approved'` の内容として閲覧可能
- **INV-04**: 任意のルートで chunk load error を意図的に発生させる（Service Worker または route interception で `_next/static/chunks/*.js` を 500 応答に差し替え）→ `src/app/error.tsx` の日本語エラー画面「エラーが発生しました」が表示 → 「もう一度試す」ボタンをクリックするとリロードされる

## 現状の検出可否
- `ls playwright.config*` → no matches found
- `ls tests` → ディレクトリ自体が存在しない
- `Glob "cypress.config.*"` 0 件
- Vitest 単体では Next.js の App Router を起動した実ブラウザでの挙動検証が不可能
- 既存の Vitest テスト（`src/lib/__tests__/constants.test.js` / `postValidation.test.ts`）は純粋関数のみ対象

## テスト種別と環境
- **種別**: E2E（実ブラウザ・実サーバー・ローカル Supabase）
- **フレームワーク**: `@playwright/test`（Chromium デフォルト、必要に応じて `@axe-core/playwright` を REQ-031 系アクセシビリティ検証と兼用）
- **セットアップ**:
  - ローカル: `supabase start` で Postgres / Auth / Storage / Edge Functions を起動
  - `supabase/seed/e2e_seed.sql` でテストユーザー（`user@test.local`, `admin@test.local`）と既存 approved 投稿 1 件を seed
  - Next.js は `npm run build && npm start -- --port 3100` で本番モード起動（dev の HMR による flake を避ける）
  - `playwright.config.ts` の `webServer` で上記を自動起動
  - `storageState` を使って user / admin の認証クッキーを事前生成し各テストで再利用（`auth.setup.ts`）
  - 環境変数: `NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321`、service role key はテスト用
- **配置先**: `tests/e2e/*.spec.ts`、`playwright.config.ts`
