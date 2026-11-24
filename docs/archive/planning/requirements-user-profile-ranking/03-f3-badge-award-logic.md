### F3: バッジ付与ロジック（DB関数）

投稿が承認されたタイミングでバッジ条件をチェックし、自動付与する。

```sql
CREATE OR REPLACE FUNCTION check_and_grant_badges()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id    UUID;
  v_post_count BIGINT;
BEGIN
  -- status が 'approved' に変わった場合のみ
  IF NEW.status <> 'approved' OR OLD.status = 'approved' THEN
    RETURN NEW;
  END IF;

  v_user_id := NEW.user_id;
  IF v_user_id IS NULL THEN RETURN NEW; END IF;

  -- 承認済み投稿数を取得
  SELECT COUNT(*) INTO v_post_count
  FROM posts WHERE user_id = v_user_id AND status = 'approved';

  -- 件数ベースのバッジ
  IF v_post_count >= 1 THEN
    INSERT INTO user_badges (user_id, badge_id)
    VALUES (v_user_id, 'first_post') ON CONFLICT DO NOTHING;
  END IF;
  IF v_post_count >= 10 THEN
    INSERT INTO user_badges (user_id, badge_id)
    VALUES (v_user_id, 'posts_10') ON CONFLICT DO NOTHING;
  END IF;
  IF v_post_count >= 50 THEN
    INSERT INTO user_badges (user_id, badge_id)
    VALUES (v_user_id, 'posts_50') ON CONFLICT DO NOTHING;
  END IF;
  IF v_post_count >= 100 THEN
    INSERT INTO user_badges (user_id, badge_id)
    VALUES (v_user_id, 'posts_100') ON CONFLICT DO NOTHING;
  END IF;

  -- 複数種投稿バッジ
  IF EXISTS (
    SELECT 1 FROM posts WHERE user_id = v_user_id AND status = 'approved'
    GROUP BY species HAVING COUNT(DISTINCT species) >= 2
  ) THEN
    INSERT INTO user_badges (user_id, badge_id)
    VALUES (v_user_id, 'multi_species') ON CONFLICT DO NOTHING;
  END IF;

  -- 広域調査バッジ
  IF (SELECT COUNT(DISTINCT municipality)
      FROM posts WHERE user_id = v_user_id AND status = 'approved'
      AND municipality IS NOT NULL) >= 3 THEN
    INSERT INTO user_badges (user_id, badge_id)
    VALUES (v_user_id, 'multi_municipality') ON CONFLICT DO NOTHING;
  END IF;

  -- AI太鼓判バッジ
  IF NEW.auto_approved = true
     AND (NEW.ai_result->>'confidence')::numeric >= 0.95 THEN
    INSERT INTO user_badges (user_id, badge_id)
    VALUES (v_user_id, 'ai_perfect') ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_post_approved_check_badges
  AFTER UPDATE ON posts
  FOR EACH ROW EXECUTE FUNCTION check_and_grant_badges();
```

