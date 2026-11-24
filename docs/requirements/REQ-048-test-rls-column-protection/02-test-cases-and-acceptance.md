## テストケース（Given/When/Then）

### TC-01: 一般ユーザーが INSERT 時に運用制御カラムを指定しても強制リセットされる
- **Given**: `SET LOCAL request.jwt.claims` で `app_metadata.role='user'`、`auth.uid()` = テストユーザー A
- **When**: `INSERT INTO posts (user_id, species, info_type, lat, lng, photos, is_official, is_flagged, ai_result, status) VALUES (A, 'american', 'sighting', 39.7, 140.1, ARRAY['x'], TRUE, TRUE, '{"x":1}'::jsonb, 'approved') RETURNING id, is_official, is_flagged, ai_result, status;`
- **Then**: 返却行で `is_official = FALSE`、`is_flagged = FALSE`、`ai_result IS NULL`、`status = 'pending'`（INV-01）

### TC-02: 一般ユーザーの UPDATE は status/is_official/reviewed_by を変更できない
- **Given**: TC-01 で作成した pending 投稿（`is_official=false`, `status='pending'`）。同ユーザーで JWT 設定
- **When**: `UPDATE posts SET status='approved', is_official=TRUE, reviewed_by=A WHERE id=<post_id> RETURNING status, is_official, reviewed_by;`
- **Then**: 返却行で `status='pending'`、`is_official=FALSE`、`reviewed_by IS NULL`（OLD 維持、INV-02）

### TC-03: admin は INSERT 時に is_official=true を設定できる
- **Given**: `SET LOCAL request.jwt.claims` で `app_metadata.role='admin'`、`auth.uid()` = admin ユーザー
- **When**: `INSERT INTO posts (user_id, species, info_type, lat, lng, photos, is_official) VALUES (admin, 'american', 'sighting', 39.7, 140.1, ARRAY['x'], TRUE) RETURNING is_official;`
- **Then**: `is_official = TRUE` が保持される（INV-03）

### TC-04: admin は UPDATE で status='approved' に変更できる
- **Given**: TC-01 で作成した pending 投稿。admin JWT に切替
- **When**: `UPDATE posts SET status='approved', reviewed_by=<admin_uuid>, reviewed_at=now() WHERE id=<post_id> RETURNING status, reviewed_by;`
- **Then**: `status='approved'`、`reviewed_by=<admin_uuid>`（INV-03）

### TC-05: service_role は status='approved' / auto_approved=true を直接更新できる
- **Given**: `SET LOCAL request.jwt.claims = '{"role":"service_role"}'`（Edge Function 想定）。事前に一般ユーザーで作成した pending 投稿
- **When**: `UPDATE posts SET status='approved', auto_approved=TRUE, ai_analyzed_at=now() WHERE id=<post_id> RETURNING status, auto_approved;`
- **Then**: `status='approved'`、`auto_approved=TRUE`（INV-04、Edge Function の自動承認フロー担保）

### TC-06: anon ロールは INSERT できない
- **Given**: `SET LOCAL ROLE anon;`（JWT claims は未設定）
- **When**: `INSERT INTO posts (user_id, species, info_type, lat, lng, photos) VALUES ('00000000-0000-0000-0000-000000000000', 'american', 'sighting', 39.7, 140.1, ARRAY['x']);`
- **Then**: `throws_ok('new row violates row-level security policy for table "posts"')`（INV-05）

### TC-07: 一般ユーザーが ai_analyzed_at を UPDATE で書き換えられない
- **Given**: service_role で `ai_analyzed_at='2026-01-01T00:00:00Z'` をセット済みの post。その後、投稿者本人（一般ユーザー）JWT に切替
- **When**: `UPDATE posts SET ai_analyzed_at = NULL, ai_result = NULL WHERE id=<post_id> RETURNING ai_analyzed_at, ai_result;`
- **Then**: `ai_analyzed_at='2026-01-01T00:00:00Z'`（OLD 維持）、`ai_result` 既存値が維持される（INV-02 の補強）

## カバレッジ目標
- `supabase/schema.sql:494-496` の `auth_insert` ポリシー: TC-06 で 100% 到達
- `supabase/schema.sql:540-578` の `protect_post_status` 関数: TC-02 / TC-04 / TC-05 / TC-07 で `role='service_role'` / `role='admin'` / 一般ユーザー 3 分岐すべて到達
- `supabase/schema.sql:582-619` の `protect_post_insert_columns` 関数: TC-01 / TC-03 で admin／一般ユーザー両分岐到達

## テストデータ / フィクスチャ
`supabase/tests/fixtures/rls_posts_seed.sql` に以下を配置（`BEGIN;` トランザクション内で各 TC 前に呼び出す）。

- `auth.users` に 3 ユーザー挿入（UUID 固定）:
  - `00000000-0000-0000-0000-00000000000A` / `app_metadata='{"role":"user"}'`
  - `00000000-0000-0000-0000-00000000000B` / `app_metadata='{"role":"user"}'`
  - `00000000-0000-0000-0000-0000000000AD` / `app_metadata='{"role":"admin"}'`
- `profiles` に同 UUID で 3 行
- JWT claims セット用のヘルパー関数 `set_jwt(role_key text, user_id uuid)` を `supabase/tests/helpers.sql` に定義

## 受入条件
- [ ] AC-01: `supabase db test supabase/tests/rls_posts.sql` がローカル Postgres でグリーン（pg-tap の `# ok` 全件）
- [ ] AC-02: ネガティブ検証 — `supabase/schema.sql:618` の `CREATE TRIGGER enforce_post_insert_columns` を一時的に `DROP TRIGGER` してテスト再実行すると TC-01 / TC-07 が RED になること、および `auth_insert` ポリシーを `TO public` に書き換えると TC-06 が RED になること
- [ ] AC-03: CI（`.github/workflows/ci.yml`）に `supabase start && supabase db test` ステップを追加し、PR で 3 回連続グリーンを確認

## 影響範囲
- 新規ファイル: `supabase/tests/rls_posts.sql`、`supabase/tests/helpers.sql`、`supabase/tests/fixtures/rls_posts_seed.sql`
- CI ワークフロー: `.github/workflows/ci.yml` に `supabase/setup-cli` アクションと `supabase db test` ステップを追加
- 既存 `supabase/schema.sql` には変更なし（検証対象）

## 優先度
- **緊急度**: 高
- **重要度**: Critical
- **理由**: REQ-034 で追加したトリガー／ポリシーは権限昇格防御の最終防衛線で、かつ DB 層の変更はアプリテストから検知不能。pg-tap テスト不在のまま schema.sql を編集するリグレッションリスクが継続している。
