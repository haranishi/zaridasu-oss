# REQ-168: schema.sql ドリフト — posts.ai_failure_count 欠落で protect_post_status / rls_posts が失敗

## 背景
CI `rls-tests` ジョブは `supabase/schema.sql` を psql で直接適用し、`supabase/tests/*.sql` を pg-tap で検証する
（migrations ではなく schema.sql を真とする運用、`.github/workflows/ci.yml` の注記参照）。
`posts.ai_failure_count` 列は migration `20260512000001_ai_failure_tracking.sql` で `ALTER TABLE posts ADD COLUMN` 追加された一方、
`schema.sql` の `posts` テーブル定義（`CREATE TABLE posts`）には反映されていない。

しかし `schema.sql` の `protect_post_status()` トリガー関数（`:588-645`）は更新済みで、`:623` で
`NEW.ai_failure_count := OLD.ai_failure_count;` と当該列を参照している。結果、schema.sql 単体では「列が存在しない posts に対し
ai_failure_count を参照する関数」という内部不整合（ドリフト）になっている。

## 現状の問題
- `supabase/schema.sql` の posts テーブル定義に `ai_failure_count` 列が無い（`grep ai_failure_count schema.sql` は
  関数内 `:623` のみヒットし、テーブル定義にはヒットしない）。
- `protect_post_status()`（`schema.sql:588-645`）は `:623` で `NEW.ai_failure_count := OLD.ai_failure_count;` を実行。
- pg-tap `supabase/tests/rls_posts.sql:61` で posts を UPDATE するとトリガーが発火し、
  `ERROR: record "new" has no field "ai_failure_count"`（`protect_post_status() line 35`）で失敗。
- 結果 `rls_posts.sql` は計画33サブテスト中3しか走らず「Bad plan」で FAIL（CI `rls-tests` ジョブが赤）。

### 再現
```
psql -f supabase/schema.sql
pg_prove --ext .sql supabase/tests/rls_posts.sql
# => ERROR: record "new" has no field "ai_failure_count"
```

## 目的
`schema.sql` の posts テーブル定義に `ai_failure_count` を追加し、migration と schema.sql の整合（ドリフト解消）を回復する。
あわせて、列がトリガーで保護されるべきカラムであることの整合を確認する。

## 要件
### 機能要件
- [ ] FR-168-01: `supabase/schema.sql` の `CREATE TABLE posts (...)` に、migration `20260512000001_ai_failure_tracking.sql` と
  同じ定義で `ai_failure_count`（型・デフォルト・NOT NULL 有無・付随インデックス `idx_posts_ai_failure_count` 等）を追加する。
- [ ] FR-168-02: 追加後、`protect_post_status()`（`:623`）の `NEW.ai_failure_count := OLD.ai_failure_count` が
  存在する列を参照する状態になることを確認する。
- [ ] FR-168-03: migration（20260512000001 ほか ai_failure 関連）と schema.sql の posts 定義・トリガー保護列が
  乖離していないことを確認する。他にも schema.sql に未反映の migration 由来カラム（例: REQ-136 等で追加された保護列）が
  ないか棚卸しし、あれば同時に整合させる。

### 非機能要件
- [ ] NFR-168-01: 本変更は schema.sql のドリフト解消であり、本番 DB の実スキーマ（migration 適用済み）には影響しないこと。
- [ ] NFR-168-02: （任意）REQ-148 の `schema:check` と同様に、protect_post_status が参照する列が posts 定義に存在するかを
  検査する仕組みの追加を検討する。

## 受入条件
- [ ] AC-01: `psql -f supabase/schema.sql` 適用後、`pg_prove supabase/tests/rls_posts.sql` が計画通り33サブテスト走り全通過する。
- [ ] AC-02: `protect_post_status()` 発火を伴う posts UPDATE が `has no field` エラーを出さない。
- [ ] AC-03: CI `rls-tests` ジョブの rls_posts.sql 部分がグリーンになる。

## 影響範囲
- `supabase/schema.sql`（posts テーブル定義、必要なら index）
- `supabase/tests/rls_posts.sql`（テスト自体は変更不要・検証対象）
- CI `rls-tests` ジョブ

## 優先度
- **緊急度**: High / **重要度**: High
- **理由**: schema.sql が内部不整合の状態であり、CI の RLS/トリガー検証を全面的にブロックしている。schema.sql は CI の真と
  されるため、ドリフトはテストの信頼性そのものを損なう。修正は列追加で低リスクかつ効果が大きい。
