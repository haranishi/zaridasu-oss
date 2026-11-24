-- REQ-133: reports INSERT ポリシー重複バグの解消（無検証 INSERT 経路の閉塞）
--
-- 背景:
--   本番 pg_policies には `public_insert_reports` (WITH CHECK true) と
--   `validated_insert_reports` (WITH CHECK 付き) が共存しており、
--   PERMISSIVE ポリシー OR 結合により validated 側の制約が事実上バイパスされる。
--   schema.sql / 初期 migration 側には `public_insert_reports` のみが定義されており、
--   本 migration で drift を回収して 1 本に統一する。
--
-- 仕様: INSERT は post_id NOT NULL / reason ∈ enum / comment <= 500 文字。
-- 二重防御として comment 長さは CHECK 制約でも担保。

BEGIN;

-- 0. 既存データの整合性確保: 500 文字超の comment を truncate（idempotent）
UPDATE public.reports
   SET comment = left(comment, 500)
 WHERE comment IS NOT NULL AND char_length(comment) > 500;

-- 1. 重複 INSERT policy を削除（idempotent）
DROP POLICY IF EXISTS "public_insert_reports"    ON public.reports;
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

COMMENT ON POLICY "validated_insert_reports" ON public.reports IS
  'REQ-133: 通報 INSERT の唯一のポリシー。post_id NOT NULL / reason enum / comment <= 500 文字を担保。';

COMMIT;
