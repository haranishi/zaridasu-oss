-- REQ-250 (Part A): ザリガニ・コレクション / 図鑑 / 水槽（所有権・収集要素・DB 権威）
--
-- 背景:
--   REQ-248 が「進行（レベル/XP）」を、REQ-249 が「段階的機能解放」を用意した。本 migration は
--   その上に「観察の成果を所有できるコレクション」を作る。承認済み投稿から種ごとの図鑑カードを
--   埋め（種 × info_type × 市区町村 × 初観察）、水槽（ビオトープ）に泳がせる土台にする。
--   REQ-249 の FEATURE_UNLOCKS.collection は enforcement='server'（書き込みを伴う永続化）と印付け
--   されており、本 migration がそのサーバー強制（トリガーのみ書き込み + RLS）を実装する。
--
-- 設計原則（Goodhart 対策・市民科学ファースト / NFR-250-04）:
--   コレクションは「承認済み（検証済み）投稿」でのみ前進する。未承認 / 却下 / いいねでは一切増えない
--   （award_xp_on_approval / check_and_grant_badges と同一ガード / schema.sql:1073・1856）。
--   所有状態はクライアントから改竄できない（INSERT/UPDATE ポリシー無し = user_badges / user_progress と同パターン）。
--
-- 冪等: CREATE TABLE IF NOT EXISTS / CREATE OR REPLACE FUNCTION / DROP TRIGGER IF EXISTS + CREATE /
--       DO $$ ... EXCEPTION WHEN duplicate_object $$。バックフィルは recompute_all_collections（上書き）で冪等。
-- 同期: supabase/schema.sql の「12-2. コレクション / 図鑑 / 水槽 (REQ-250)」ブロックと同一定義（REQ-003 ドリフトゼロ）。
-- 依存: 20260703000004_contribution_level_xp_engine.sql（user_progress / level）。本 migration はその後段に置く。

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- (A) コレクション状態テーブル（DB 権威・改竄不能 / FR-250-01 / FR-250-02）。
--     種ごとに 1 行。承認済み投稿から導出し、書き込みは update_collection_on_approval トリガーと
--     recompute_all_collections 関数のみ（INSERT/UPDATE ポリシーを作らない = user_progress と同一パターン）。
--     図鑑カードは「種 ×（info_type 5 種）×（市区町村 25）× 初観察」で埋まっていく（多様性軸の構造を流用）。
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_collection (
  user_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- posts.species と同じ許容値（DB 固定の 2 種）。図鑑カードの単位。
  species             TEXT        NOT NULL CHECK (species IN ('american', 'bullfrog')),
  -- はじめてその種を承認観察した日時（observed_at 優先・無ければ created_at）。カードの「初観察」表示に使う。
  first_observed_at   TIMESTAMPTZ,
  -- その種で観察済みの info_type / 市区町村の集合（重複なし）。カードの「埋まり具合」を出す。
  info_types_seen     TEXT[]      NOT NULL DEFAULT '{}',
  municipalities_seen TEXT[]      NOT NULL DEFAULT '{}',
  -- その種の検証済み（承認）観察数。水槽の個体数・カードの合計に使う。
  verified_count      BIGINT      NOT NULL DEFAULT 0 CHECK (verified_count >= 0),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, species)
);
COMMENT ON TABLE user_collection IS
  'REQ-250: コレクション（図鑑/水槽）状態。承認済み投稿から導出（DB 権威・改竄不能）。書き込みは update_collection_on_approval / recompute_all_collections のみ（INSERT/UPDATE ポリシー無し = user_progress と同パターン）。';

CREATE INDEX IF NOT EXISTS idx_user_collection_user ON user_collection(user_id);

ALTER TABLE user_collection ENABLE ROW LEVEL SECURITY;
-- SELECT: 本人 OR 公開プロフィール（get_user_progress / ランキング RPC と同じ is_public 準拠 / FR-250-02）。
-- 書き込みポリシーは意図的に作らない（トリガー / SECURITY DEFINER 関数のみが書ける = サーバー強制）。
DO $$ BEGIN
  CREATE POLICY "collection_viewable" ON user_collection FOR SELECT USING (
    (SELECT auth.uid()) = user_id
    OR EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = user_collection.user_id AND up.is_public = true)
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- (B) コレクション前進トリガー（FR-250-01 / FR-250-02 / NFR-250-04）。承認遷移でのみ発火。
--     award_xp_on_approval とは独立した兄弟トリガー（相互非干渉）。失敗は承認本体をロールバックさせない
--     （best-effort・EXCEPTION で握って承認は必ず通す）。
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_collection_on_approval()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid;
  v_first   timestamptz;
BEGIN
  -- 承認遷移（pending→approved）でのみ発火（check_and_grant_badges と同一ガード / schema.sql:1073）。
  IF NEW.status <> 'approved' OR (TG_OP = 'UPDATE' AND OLD.status = 'approved') THEN RETURN NEW; END IF;
  v_user_id := NEW.user_id;
  IF v_user_id IS NULL THEN RETURN NEW; END IF;

  BEGIN
    v_first := COALESCE(NEW.observed_at, NEW.created_at, now());

    INSERT INTO user_collection (
      user_id, species, first_observed_at, info_types_seen, municipalities_seen, verified_count, updated_at
    ) VALUES (
      v_user_id, NEW.species, v_first,
      ARRAY[NEW.info_type],
      CASE WHEN NEW.municipality IS NULL THEN '{}'::text[] ELSE ARRAY[NEW.municipality] END,
      1, now()
    )
    ON CONFLICT (user_id, species) DO UPDATE SET
      first_observed_at   = LEAST(user_collection.first_observed_at, EXCLUDED.first_observed_at),
      -- 重複なしで info_type を追加（未収集なら追記・既収集なら据え置き）。
      info_types_seen     = CASE WHEN NEW.info_type = ANY(user_collection.info_types_seen)
                                 THEN user_collection.info_types_seen
                                 ELSE array_append(user_collection.info_types_seen, NEW.info_type) END,
      -- 市区町村は NULL を集合に入れない。重複なしで追加。
      municipalities_seen = CASE WHEN NEW.municipality IS NULL
                                   OR NEW.municipality = ANY(user_collection.municipalities_seen)
                                 THEN user_collection.municipalities_seen
                                 ELSE array_append(user_collection.municipalities_seen, NEW.municipality) END,
      verified_count      = user_collection.verified_count + 1,
      updated_at          = now();
  EXCEPTION WHEN OTHERS THEN
    -- NFR-250-04 / NFR-248-01 と同思想: コレクション更新の失敗は承認本体を壊さない。警告のみ残す。
    RAISE WARNING 'update_collection_on_approval failed for user %: %', v_user_id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_post_approved_update_collection ON posts;
CREATE TRIGGER on_post_approved_update_collection
  AFTER UPDATE ON posts FOR EACH ROW
  EXECUTE FUNCTION update_collection_on_approval();

-- ───────────────────────────────────────────────────────────────────────────
-- (C) バックフィル / 再計算（NFR-250-04）。既存ユーザーのコレクションを承認済み投稿から遡って算出する。
--     権限: JWT 無し（migration / 直 DB）または service_role / admin のみ（recompute_all_progress と同判定）。
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION recompute_all_collections()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE jwt_claims jsonb;
BEGIN
  BEGIN
    jwt_claims := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb;
  EXCEPTION WHEN OTHERS THEN jwt_claims := NULL;
  END;
  IF jwt_claims IS NOT NULL AND jwt_claims <> '{}'::jsonb THEN
    IF (jwt_claims ->> 'role') IS DISTINCT FROM 'service_role'
       AND (jwt_claims -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'admin' THEN
      RAISE EXCEPTION 'Permission denied';
    END IF;
  END IF;

  INSERT INTO user_collection (
    user_id, species, first_observed_at, info_types_seen, municipalities_seen, verified_count, updated_at
  )
  SELECT
    p.user_id,
    p.species,
    MIN(COALESCE(p.observed_at, p.created_at, now()))            AS first_observed_at,
    array_agg(DISTINCT p.info_type)                             AS info_types_seen,
    array_remove(array_agg(DISTINCT p.municipality), NULL)      AS municipalities_seen,
    COUNT(*)::bigint                                            AS verified_count,
    now()
  FROM posts p
  WHERE p.status = 'approved' AND p.user_id IS NOT NULL
  GROUP BY p.user_id, p.species
  ON CONFLICT (user_id, species) DO UPDATE SET
    first_observed_at   = EXCLUDED.first_observed_at,
    info_types_seen     = EXCLUDED.info_types_seen,
    municipalities_seen = EXCLUDED.municipalities_seen,
    verified_count      = EXCLUDED.verified_count,
    updated_at          = now();
END;
$$;
COMMENT ON FUNCTION recompute_all_collections() IS
  'REQ-250 NFR-250-04: 承認済み投稿からコレクションを遡って再計算（バックフィル）。migration が一度だけ呼ぶ。';

-- ───────────────────────────────────────────────────────────────────────────
-- (D) 参照 RPC（FR-250-01）。集計のみ・is_public 準拠（get_user_progress と同じプライバシー方針）。
--     種ごとの図鑑カード状態（初観察 / 情報種別集合 / 市区町村集合 / 検証済み数）を返す。
--     水槽の容量・デコレーションは DB 権威の level（get_user_progress）からクライアントが算出する
--     （useUnlocks と同思想: 定数マップ × 改竄不能な level）。
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_user_collection(p_user_id UUID)
RETURNS TABLE (
  species             text,
  first_observed_at   timestamptz,
  info_types_seen     text[],
  municipalities_seen text[],
  verified_count      bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_is_owner  boolean := (p_user_id = (SELECT auth.uid()));
  v_is_public boolean;
BEGIN
  SELECT COALESCE(up.is_public, false) INTO v_is_public FROM user_profiles up WHERE up.id = p_user_id;
  -- 非公開プロフィールを本人以外が参照しても行を返さない（get_user_progress と同じ方針）。
  IF NOT v_is_owner AND NOT COALESCE(v_is_public, false) THEN RETURN; END IF;

  RETURN QUERY
    SELECT uc.species, uc.first_observed_at, uc.info_types_seen, uc.municipalities_seen, uc.verified_count
    FROM user_collection uc
    WHERE uc.user_id = p_user_id
    ORDER BY uc.first_observed_at NULLS LAST, uc.species;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_user_collection(UUID) TO authenticated, anon;
COMMENT ON FUNCTION public.get_user_collection(UUID) IS
  'REQ-250 FR-250-01: コレクション（図鑑）状態の参照 RPC（集計のみ・is_public 準拠）。種ごとの初観察/情報種別集合/市区町村集合/検証済み数を返す。';

-- ───────────────────────────────────────────────────────────────────────────
-- (E) 一度きりのバックフィル（NFR-250-04）。既存ユーザーの承認済み投稿からコレクションを埋める。
--     JWT 無し（migration コンテキスト）のため recompute_all_collections は権限チェックを通過する。
-- ───────────────────────────────────────────────────────────────────────────
SELECT recompute_all_collections();

COMMIT;
