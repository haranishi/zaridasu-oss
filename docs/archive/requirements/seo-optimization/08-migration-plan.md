## マイグレーション計画

### Migration-001: municipalities テーブル作成
- **変更種別:** テーブル追加
- **SQL:**
  ```sql
  -- Up
  CREATE TABLE municipalities (
    id text PRIMARY KEY,
    name text NOT NULL,
    slug text NOT NULL UNIQUE,
    lat float8 NOT NULL,
    lng float8 NOT NULL,
    post_count int4 NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now()
  );

  ALTER TABLE municipalities ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "municipalities_select" ON municipalities FOR SELECT USING (true);

  -- 秋田県の市区町村データを挿入
  INSERT INTO municipalities (id, name, slug, lat, lng) VALUES
  ('052019', '秋田市', 'akita-shi', 39.7200, 140.1025),
  ('052027', '能代市', 'noshiro-shi', 40.2126, 140.0268),
  ('052035', '横手市', 'yokote-shi', 39.3113, 140.5533),
  ('052043', '大館市', 'odate-shi', 40.2713, 140.5641),
  ('052051', '男鹿市', 'oga-shi', 39.8867, 139.8480),
  ('052060', '湯沢市', 'yuzawa-shi', 39.1651, 140.4948),
  ('052078', '鹿角市', 'kazuno-shi', 40.2133, 140.7880),
  ('052094', '由利本荘市', 'yurihonjo-shi', 39.3862, 140.0489),
  ('052108', '潟上市', 'katagami-shi', 39.8879, 140.0355),
  ('052116', '大仙市', 'daisen-shi', 39.4505, 140.4766),
  ('052124', '北秋田市', 'kitaakita-shi', 40.2296, 140.3680),
  ('052132', 'にかほ市', 'nikaho-shi', 39.2026, 139.9079),
  ('052141', '仙北市', 'semboku-shi', 39.6975, 140.5667);

  -- Down
  DROP TABLE IF EXISTS municipalities;
  ```
- **影響範囲:** 新規テーブルのため既存データへの影響なし

### Migration-002: posts テーブルにインデックス追加
- **変更種別:** インデックス追加
- **SQL:**
  ```sql
  -- Up
  CREATE INDEX IF NOT EXISTS idx_posts_municipality
    ON posts(municipality) WHERE status = 'approved';
  CREATE INDEX IF NOT EXISTS idx_posts_species_municipality
    ON posts(species, municipality) WHERE status = 'approved';

  -- Down
  DROP INDEX IF EXISTS idx_posts_municipality;
  DROP INDEX IF EXISTS idx_posts_species_municipality;
  ```
- **影響範囲:** 読み取りパフォーマンス向上、書き込み時のわずかなオーバーヘッド

---
