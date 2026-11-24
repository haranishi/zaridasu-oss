## Step 8: マイグレーション計画

### Migration-001: posts CHECK 制約追加
- **変更種別:** 制約追加
- **SQL:**
  ```sql
  -- Up
  -- 既存データ確認
  SELECT count(*) FROM posts WHERE is_anonymous = false AND user_id IS NULL;

  -- 不整合データ修正（存在する場合）
  UPDATE posts SET is_anonymous = true WHERE is_anonymous = false AND user_id IS NULL;

  -- 制約追加
  ALTER TABLE posts ADD CONSTRAINT chk_user_id_required
    CHECK (is_anonymous = true OR user_id IS NOT NULL);

  -- Down
  ALTER TABLE posts DROP CONSTRAINT IF EXISTS chk_user_id_required;
  ```
- **影響範囲:** 既存データに不整合がある場合は事前修正が必要
- **ダウンタイム:** なし（CHECK 制約追加は NOT VALID オプション付きで即時）

### Migration-002: 外部キー CASCADE 変更
- **変更種別:** 外部キー制約変更
- **SQL:**
  ```sql
  -- Up
  -- comments
  ALTER TABLE comments DROP CONSTRAINT IF EXISTS comments_user_id_fkey;
  ALTER TABLE comments ADD CONSTRAINT comments_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

  -- likes
  ALTER TABLE likes DROP CONSTRAINT IF EXISTS likes_user_id_fkey;
  ALTER TABLE likes ADD CONSTRAINT likes_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

  -- survey_requests
  ALTER TABLE survey_requests DROP CONSTRAINT IF EXISTS survey_requests_user_id_fkey;
  ALTER TABLE survey_requests ADD CONSTRAINT survey_requests_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

  -- reports (SET NULL)
  ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_user_id_fkey;
  ALTER TABLE reports ADD CONSTRAINT reports_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

  -- Down
  -- 元の制約に戻す（制約名は環境に応じて調整）
  ALTER TABLE comments DROP CONSTRAINT IF EXISTS comments_user_id_fkey;
  ALTER TABLE comments ADD CONSTRAINT comments_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id);

  ALTER TABLE likes DROP CONSTRAINT IF EXISTS likes_user_id_fkey;
  ALTER TABLE likes ADD CONSTRAINT likes_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id);

  ALTER TABLE survey_requests DROP CONSTRAINT IF EXISTS survey_requests_user_id_fkey;
  ALTER TABLE survey_requests ADD CONSTRAINT survey_requests_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

  ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_user_id_fkey;
  ALTER TABLE reports ADD CONSTRAINT reports_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id);
  ```
- **影響範囲:** ユーザー削除時の関連データ削除動作が変更
- **ダウンタイム:** なし

---

