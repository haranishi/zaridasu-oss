## 目的

- 重複した INSERT policy を解消し、`reports.INSERT` 経路を **1 本のバリデーション付き policy** だけにする
- `comment` 長さ上限・`reason` enum 一致を WITH CHECK レベルでも明示する（テーブル CHECK 制約と二重防御）
- 本番の schema drift を migration で吸収し、CI で永続的に再発防止する

## 要件

### 機能要件

- [ ] **FR-133-01: 新規 migration の作成**
  ファイル名: `supabase/migrations/20260513000005_fix_reports_insert_policy.sql`
  以下を含む:
  ```sql
  BEGIN;

  -- 1. 重複 INSERT policy を削除
  DROP POLICY IF EXISTS "public_insert_reports" ON public.reports;
  DROP POLICY IF EXISTS "validated_insert_reports" ON public.reports;

  -- 2. バリデーション付き INSERT policy を 1 本だけ再作成
  CREATE POLICY "validated_insert_reports" ON public.reports
    FOR INSERT
    WITH CHECK (
      post_id IS NOT NULL
      AND reason IN ('spam', 'wrong_location', 'inappropriate', 'other')
      AND (comment IS NULL OR char_length(comment) <= 500)
    );

  -- 3. テーブル CHECK 制約で comment 長さも防御 (DB 直叩き対策)
  ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_comment_length;
  ALTER TABLE public.reports ADD CONSTRAINT reports_comment_length
    CHECK (comment IS NULL OR char_length(comment) <= 500);

  COMMIT;
  ```

- [ ] **FR-133-02: `supabase/schema.sql` の同期**
  `supabase/schema.sql:234` を上記 `validated_insert_reports` に置き換える（`public_insert_reports` の `DO $$ ... CREATE POLICY` ブロックを削除し、上記 1 本のみ残す）。`comment` 長さ CHECK 制約も同ファイル内に追加（テーブル定義の直後 or 230 行付近に挿入）。

- [ ] **FR-133-03: 既存データの整合性確認**
  migration 適用前に `SELECT count(*) FROM reports WHERE char_length(comment) > 500` を実行し、500 文字超のコメントが存在する場合は事前に `comment = left(comment, 500)` で truncate する SQL を migration の冒頭に追加（idempotent）。
