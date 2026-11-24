## カバレッジ目標
- E2E は line/statement coverage ではなく **フロー覆域** を指標にする:
  - 表示フロー（INV-01）／投稿フロー（INV-02）／承認フロー（INV-03）／障害時フォールバック（INV-04）の 4 シナリオ pass
- REQ-036（error boundary i18n）、REQ-034（RLS／列保護）、REQ-035（middleware getUser）の結合部分を間接的にスモーク

## テストデータ / フィクスチャ
- `supabase/seed/e2e_seed.sql`:
  - ユーザー 2 名（user@test.local / admin@test.local）を `auth.users` に挿入、`app_metadata` に role を設定
  - approved 投稿 1 件（TC-01 用）、秋田市座標
- `tests/e2e/.auth/user.json` / `tests/e2e/.auth/admin.json`: `auth.setup.ts` で生成される storageState（gitignore 推奨）
- `tests/e2e/helpers/db.ts`: service role client 経由で posts を count / delete するヘルパー（テスト後のクリーンアップ）
- `tests/e2e/helpers/auth.setup.ts`: Playwright `globalSetup` 相当。`/admin/login` 経由で Supabase Auth にログインし storageState を保存

## 受入条件
- [ ] AC-01: `npx playwright test` がローカル（Supabase + Next.js 本番ビルド）でグリーン（4 TC 全 pass）
- [ ] AC-02: ネガティブ検証 — (a) `supabase/schema.sql:484-488` の `moderated_read` ポリシーを `USING (false)` に置換すると TC-03 が RED。(b) `src/app/error.tsx` の文言を空文字列に書き換えると TC-04 が RED。(c) `src/app/post/page.tsx` 相当の投稿フォーム submit ハンドラを no-op にすると TC-02 が RED
- [ ] AC-03: GitHub Actions（`.github/workflows/ci.yml`）に e2e ジョブを追加し、`retries: 0` の設定で 3 回連続グリーン（flaky 無し）
