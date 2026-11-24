-- REQ-135: Storage INSERT を「自分の uid フォルダ配下のみ」に制限
--
-- 背景:
--   post-photos / post-audio の INSERT policy は拡張子と bucket_id しかチェックしておらず、
--   認証ユーザーは任意の名前（他人 uuid 配下 / anon/ 配下）でファイルを書ける状態だった。
--   DELETE policy は既に `name LIKE auth.uid() || '/%'` で owner 制限しているため、
--   攻撃者は「書き込み放題 + 被害者は気づかず消せない」状態にできてしまう。
--   本 migration で INSERT policy にフォルダ ownership チェックを追加し対称な防御線にする。

BEGIN;

-- ============================================================
-- post-photos
-- ============================================================
DROP POLICY IF EXISTS "authenticated_upload" ON storage.objects;
CREATE POLICY "authenticated_upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'post-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND lower(storage.extension(name)) IN ('jpg', 'jpeg', 'png', 'webp', 'heic')
  );

-- ============================================================
-- post-audio
-- ============================================================
DROP POLICY IF EXISTS "authenticated_upload_audio" ON storage.objects;
CREATE POLICY "authenticated_upload_audio" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'post-audio'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND lower(storage.extension(name)) IN ('webm', 'mp4', 'm4a', 'mp3', 'ogg')
  );

-- 注: Supabase ホスト環境では storage.objects の所有者が supabase_storage_admin であり、
-- postgres ロールから COMMENT ON POLICY ... ON storage.objects を実行すると
-- "must be owner of relation objects" (42501) で失敗するため、ポリシーの説明は
-- 下記 SQL コメントとして残す（COMMENT 文は使用しない）。
--   authenticated_upload       : post-photos への INSERT は uid フォルダ配下のみ。拡張子 jpg/jpeg/png/webp/heic。
--   authenticated_upload_audio : post-audio への INSERT は uid フォルダ配下のみ。拡張子 webm/mp4/m4a/mp3/ogg。

COMMIT;
