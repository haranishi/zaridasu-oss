-- ===================================================
-- Migration: FR-002 + FR-037
-- posts CHECK 制約追加 + 外部キー CASCADE 修正
-- ===================================================

-- FR-002: is_anonymous=false の場合 user_id 必須
-- 既存データの不整合を修正
UPDATE posts SET is_anonymous = true WHERE is_anonymous = false AND user_id IS NULL;

-- CHECK 制約追加
ALTER TABLE posts DROP CONSTRAINT IF EXISTS chk_user_id_required;
ALTER TABLE posts ADD CONSTRAINT chk_user_id_required
  CHECK (is_anonymous = true OR user_id IS NOT NULL);

-- FR-037: 外部キー CASCADE 修正
-- comments: ユーザー削除時にコメントも削除
ALTER TABLE comments DROP CONSTRAINT IF EXISTS comments_user_id_fkey;
ALTER TABLE comments ADD CONSTRAINT comments_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- likes: ユーザー削除時にいいねも削除（既に CASCADE だが明示的に再設定）
ALTER TABLE likes DROP CONSTRAINT IF EXISTS likes_user_id_fkey;
ALTER TABLE likes ADD CONSTRAINT likes_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- survey_requests: ユーザー削除時に調査依頼も削除（既に CASCADE だが明示的に再設定）
ALTER TABLE survey_requests DROP CONSTRAINT IF EXISTS survey_requests_user_id_fkey;
ALTER TABLE survey_requests ADD CONSTRAINT survey_requests_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- reports: ユーザー削除時に通報者を匿名化（user_id カラムがない場合はスキップ）
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'reports' AND column_name = 'user_id'
  ) THEN
    EXECUTE 'ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_user_id_fkey';
    EXECUTE 'ALTER TABLE reports ADD CONSTRAINT reports_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL';
  END IF;
END $$;
