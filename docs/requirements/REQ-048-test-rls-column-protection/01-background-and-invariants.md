## 背景
REQ-034 で `posts` テーブルに対して以下の保護機構が追加されたが、これらは DB 層の実装であり、アプリ層のテスト（Vitest）からは実質的に到達できない。

- `auth_insert` ポリシー（`supabase/schema.sql:494-496`）— 認証済みユーザーのみ INSERT 可
- `protect_post_status` トリガー（`supabase/schema.sql:540-578`）— UPDATE 時に運用制御カラムを OLD 値へ強制
- `protect_post_insert_columns` トリガー（`supabase/schema.sql:582-619`）— INSERT 時に運用制御カラムを既定値へ強制リセット

本要件はこれら DB 機構を pg-tap ベースで直接検証し、将来のスキーマ変更（ポリシー DROP、トリガー改変、search_path 誤設定 等）による権限昇格リスクを回帰検知する自動テストを整備する。

## 守りたい不変条件
- **INV-01**: `authenticated`（`app_metadata.role != 'admin'`）が INSERT 時に `is_official=true` / `is_flagged=true` / `ai_result='{...}'::jsonb` を指定しても、`protect_post_insert_columns` により `FALSE` / `FALSE` / `NULL` に強制リセットされる
- **INV-02**: `authenticated`（非 admin）が UPDATE で `status='approved'` / `is_official=true` / `reviewed_by=<uuid>` を変更しても、`protect_post_status` により OLD 値が維持される
- **INV-03**: `admin`（`app_metadata.role='admin'`）は INSERT／UPDATE の両方で `status` / `is_official` / `is_flagged` / `ai_result` を任意の値に設定可能
- **INV-04**: `service_role`（Edge Function が使用）は `status='approved'` / `auto_approved=true` を直接 UPDATE できる（自動承認フローが機能し続ける担保）
- **INV-05**: `anon` ロールは `auth_insert` ポリシーの `TO authenticated` 指定により INSERT が拒否される（policy violation）

## 現状の検出可否
既存テストでは以下の理由によりカバーできない。

- `supabase/tests/` ディレクトリ自体が存在しない（`ls supabase/tests/` → `No such file or directory`）
- Vitest はブラウザ／Node 環境でアプリロジックを検証する枠組みで、`supabase/schema.sql:540-578` の `protect_post_status` トリガーや `supabase/schema.sql:494-496` の RLS ポリシーを実 DB に対して発火させる経路がない
- `src/lib/__tests__/` 配下には `constants.test.js` / `postValidation.test.ts` のみで、RLS／トリガーを跨ぐ統合テストは未整備
- 既存の CI（`.github/workflows/ci.yml`）には Supabase ローカル起動ステップがなく、DB 層リグレッションは手動 QA 任せ

## テスト種別と環境
- **種別**: integration（DB-native / SQL テスト）
- **フレームワーク**: Supabase CLI の `supabase db test` コマンド（内部で pg-tap を使用）
- **セットアップ**:
  - `supabase start` でローカル Postgres を起動
  - `supabase db reset` で `supabase/schema.sql` を適用
  - テスト実行前に 4 ロール（anon / user / admin / service_role）のシードを `BEGIN;` で開始し各ケース終端で `ROLLBACK;` することでトランザクション分離
  - JWT ロール切替は `SET LOCAL request.jwt.claims = '{"sub":"<uuid>","role":"authenticated","app_metadata":{"role":"admin"}}';` のように発行
- **配置先**: `supabase/tests/rls_posts.sql`
