## マイグレーション計画

### Migration-079-01: posts に hash カラム追加
```sql
-- Up
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS audio_hash text,
  ADD COLUMN IF NOT EXISTS image_hashes text[];

ALTER TABLE posts
  ADD CONSTRAINT posts_audio_hash_format
  CHECK (audio_hash IS NULL OR audio_hash ~ '^[a-f0-9]{64}$');

CREATE INDEX IF NOT EXISTS idx_posts_audio_hash
  ON posts (audio_hash) WHERE audio_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_posts_image_hashes_gin
  ON posts USING gin (image_hashes) WHERE image_hashes IS NOT NULL;

COMMENT ON COLUMN posts.audio_hash IS
  'REQ-079: 音声 SHA-256。AI 判定 dedup に使用。';
COMMENT ON COLUMN posts.image_hashes IS
  'REQ-079: 画像 SHA-256 配列（photos と同順）。AI 判定 dedup に使用。';

-- Down
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_audio_hash_format;
DROP INDEX IF EXISTS idx_posts_audio_hash;
DROP INDEX IF EXISTS idx_posts_image_hashes_gin;
ALTER TABLE posts DROP COLUMN IF EXISTS audio_hash;
ALTER TABLE posts DROP COLUMN IF EXISTS image_hashes;
```

### Migration-079-02: column-protection trigger の拡張
```sql
-- 既存 restrict_user_columns_on_update trigger に audio_hash, image_hashes を追加
-- （REQ-034 と同パターン、INSERT は許可、UPDATE は service_role のみ）
```

**影響範囲:**
- 既存データへの影響: なし（NULL 許容で追加）
- ダウンタイム: なし（ALTER ADD COLUMN は instant）
- データ移行: 既存投稿は hash NULL のまま。順次手動再判定で埋まる（または別途バックフィルジョブ、optional）

---
