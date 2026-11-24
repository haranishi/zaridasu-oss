-- REQ-174: 定点観察（structured）プロトコル — 機会記録（opportunistic）との並立設計
-- Strayer et al. 2024: 定点＋機会記録の並立を推奨。Howard et al. 2022: 不在情報記録の重要性。
-- survey_sites（定点調査サイト）を新設し、posts に survey_method（structured/opportunistic）と
-- survey_site_id を追加して、努力量込みの反復調査を機会記録と区別して保存・解析できるようにする。
-- 冪等。schema.sql と同期（REQ-003）。

CREATE TABLE IF NOT EXISTS survey_sites (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  lat          DECIMAL(10,7) NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng          DECIMAL(10,7) NOT NULL CHECK (lng BETWEEN -180 AND 180),
  municipality TEXT,
  species      TEXT CHECK (species IS NULL OR species IN ('american','bullfrog')),
  notes        TEXT CHECK (notes IS NULL OR char_length(notes) <= 500),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE survey_sites IS 'REQ-174: 定点調査サイト。同一地点の反復・努力量込み調査（structured）の基準点';
CREATE INDEX IF NOT EXISTS idx_survey_sites_user ON survey_sites (user_id);

-- posts: 調査手法と定点サイト参照
ALTER TABLE posts ADD COLUMN IF NOT EXISTS survey_method TEXT
  CHECK (survey_method IS NULL OR survey_method IN ('structured','opportunistic'));
ALTER TABLE posts ADD COLUMN IF NOT EXISTS survey_site_id UUID REFERENCES survey_sites(id) ON DELETE SET NULL;
COMMENT ON COLUMN posts.survey_method IS 'REQ-174: structured=定点反復調査, opportunistic=機会記録。NULL=旧データ';
COMMENT ON COLUMN posts.survey_site_id IS 'REQ-174: structured 投稿が紐づく定点サイト（survey_sites.id）';
CREATE INDEX IF NOT EXISTS idx_posts_survey_site ON posts (survey_site_id) WHERE survey_site_id IS NOT NULL;

-- RLS: 定点サイトは本人が管理。分布解析の透明性のため閲覧は公開（approved 投稿と同様 anon/auth 可）。
ALTER TABLE survey_sites ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "survey_sites_select_all" ON survey_sites FOR SELECT TO anon, authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "survey_sites_insert_own" ON survey_sites FOR INSERT TO authenticated
    WITH CHECK (user_id = (SELECT auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "survey_sites_update_own" ON survey_sites FOR UPDATE TO authenticated
    USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "survey_sites_delete_own" ON survey_sites FOR DELETE TO authenticated
    USING (user_id = (SELECT auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "survey_sites_admin_all" ON survey_sites FOR ALL TO authenticated
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
    WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
