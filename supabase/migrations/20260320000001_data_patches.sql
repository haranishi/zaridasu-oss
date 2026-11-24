-- ===================================================
-- 既存データ適用のためのマイグレーション（パッチ）
-- 投入済みの既存レコードにバッジなどを自動付与します
-- ===================================================

-- 1. AI誤承認の修正
UPDATE posts
SET
  status = 'rejected',
  rejection_reason = 'species_mismatch',
  rejection_message = 'AIにより申告種と異なる種と判定されました（自動修正）',
  reviewed_at = now(),
  reviewed_by = NULL,
  auto_approved = false
WHERE status = 'approved'
  AND ai_result IS NOT NULL
  AND (ai_result->>'species_match')::text = 'false'
  AND reviewed_by IS NULL;

-- 新仕様への互換性のため、何も審査されていない投稿を一部 approved にする場合などがあったら以下を利用します
-- UPDATE posts SET status = 'approved' WHERE reviewed_at IS NULL AND status = 'pending' AND ai_analyzed_at IS NULL;

-- 2. 既存ユーザーのプロフィール一括作成
INSERT INTO user_profiles (id)
  SELECT id FROM auth.users
  ON CONFLICT DO NOTHING;

-- 3. 既存データに対するバッジ一括付与
-- first_post
INSERT INTO user_badges (user_id, badge_id)
  SELECT DISTINCT user_id, 'first_post'
  FROM posts WHERE status = 'approved' AND user_id IS NOT NULL
  ON CONFLICT DO NOTHING;

-- posts_10
INSERT INTO user_badges (user_id, badge_id)
  SELECT user_id, 'posts_10'
  FROM posts WHERE status = 'approved' AND user_id IS NOT NULL
  GROUP BY user_id HAVING COUNT(*) >= 10
  ON CONFLICT DO NOTHING;

-- posts_50
INSERT INTO user_badges (user_id, badge_id)
  SELECT user_id, 'posts_50'
  FROM posts WHERE status = 'approved' AND user_id IS NOT NULL
  GROUP BY user_id HAVING COUNT(*) >= 50
  ON CONFLICT DO NOTHING;

-- posts_100
INSERT INTO user_badges (user_id, badge_id)
  SELECT user_id, 'posts_100'
  FROM posts WHERE status = 'approved' AND user_id IS NOT NULL
  GROUP BY user_id HAVING COUNT(*) >= 100
  ON CONFLICT DO NOTHING;

-- multi_species
INSERT INTO user_badges (user_id, badge_id)
  SELECT user_id, 'multi_species'
  FROM posts WHERE status = 'approved' AND user_id IS NOT NULL
  GROUP BY user_id HAVING COUNT(DISTINCT species) >= 2
  ON CONFLICT DO NOTHING;

-- multi_municipality
INSERT INTO user_badges (user_id, badge_id)
  SELECT user_id, 'multi_municipality'
  FROM posts WHERE status = 'approved' AND user_id IS NOT NULL AND municipality IS NOT NULL
  GROUP BY user_id HAVING COUNT(DISTINCT municipality) >= 3
  ON CONFLICT DO NOTHING;

-- first_comment
INSERT INTO user_badges (user_id, badge_id)
  SELECT DISTINCT user_id, 'first_comment'
  FROM comments WHERE user_id IS NOT NULL
  ON CONFLICT DO NOTHING;

-- absence_reporter
INSERT INTO user_badges (user_id, badge_id)
  SELECT user_id, 'absence_reporter'
  FROM posts WHERE status = 'approved' AND user_id IS NOT NULL AND info_type = 'absence'
  GROUP BY user_id HAVING COUNT(*) >= 5
  ON CONFLICT DO NOTHING;

-- ai_perfect
INSERT INTO user_badges (user_id, badge_id)
  SELECT DISTINCT user_id, 'ai_perfect'
  FROM posts
  WHERE status = 'approved'
    AND user_id IS NOT NULL
    AND auto_approved = true
    AND (ai_result->>'confidence')::numeric >= 0.95
  ON CONFLICT DO NOTHING;
