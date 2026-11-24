-- security-hardening 要件2: 非公開プロフィールの図鑑・進捗を、未ログインに返していた不具合の修正。
--
-- 原因: `v_is_owner := (p_user_id = auth.uid())` は、未ログイン（auth.uid() が NULL）のとき NULL になる。
--   `IF NOT v_is_owner AND NOT COALESCE(v_is_public, false) THEN RETURN` は NULL と評価され、
--   拒否の RETURN を通らずに、非公開の利用者の種・初観察日時・市区町村・件数・経験値を返していた。
--   2026-10-21 に、CI 相当の手元 DB で再現した（匿名ロール・非公開プロフィール）。
-- 修正: NULL を「本人ではない」に畳む。同型の書き方（IF NOT v_xxx）は全関数を検索して、この 2 本だけだった。
-- 公開の利用者と、本人の呼び出しは、これまでと同じ結果を返す。権限（GRANT）は CREATE OR REPLACE で保たれる。
BEGIN;

CREATE OR REPLACE FUNCTION public.get_user_progress(p_user_id UUID)
RETURNS TABLE (
  xp                bigint,
  level             integer,
  xp_into_level     bigint,   -- 現レベル開始点からの獲得 XP（プログレスバーの分子）
  xp_for_next_level bigint,   -- 現レベルの XP 幅（プログレスバーの分母。次レベルまでの必要総量）
  approved_count    bigint    -- 検証済み（承認）投稿数
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  -- 未ログイン（auth.uid() が NULL）のとき、比較は NULL になり `IF NOT v_is_owner` が素通りして
  -- 非公開プロフィールを返していた。NULL は「本人ではない」に畳む（security-hardening 要件2）。
  v_is_owner  boolean := COALESCE(p_user_id = (SELECT auth.uid()), false);
  v_is_public boolean;
  v_xp        bigint;
  v_level     integer;
BEGIN
  SELECT COALESCE(up.is_public, false) INTO v_is_public FROM user_profiles up WHERE up.id = p_user_id;
  -- 非公開プロフィールを本人以外が参照しても行を返さない（get_user_profile と同じプライバシー方針）。
  IF NOT v_is_owner AND NOT COALESCE(v_is_public, false) THEN RETURN; END IF;

  SELECT COALESCE(pr.xp, 0), COALESCE(pr.level, 1) INTO v_xp, v_level
    FROM user_progress pr WHERE pr.user_id = p_user_id;
  IF v_xp IS NULL THEN v_xp := 0; v_level := 1; END IF;
  -- 保険: 保存 level が xp と不整合でも表示は必ず整合させる。
  v_level := level_for_xp(v_xp);

  RETURN QUERY SELECT
    v_xp,
    v_level,
    v_xp - xp_for_level(v_level),
    xp_for_level(v_level + 1) - xp_for_level(v_level),
    (SELECT COUNT(*) FROM posts WHERE user_id = p_user_id AND status = 'approved')::bigint;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_collection(p_user_id UUID)
RETURNS TABLE (
  species             text,
  first_observed_at   timestamptz,
  info_types_seen     text[],
  municipalities_seen text[],
  verified_count      bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  -- 未ログイン（auth.uid() が NULL）のとき、比較は NULL になり `IF NOT v_is_owner` が素通りして
  -- 非公開プロフィールを返していた。NULL は「本人ではない」に畳む（security-hardening 要件2）。
  v_is_owner  boolean := COALESCE(p_user_id = (SELECT auth.uid()), false);
  v_is_public boolean;
BEGIN
  SELECT COALESCE(up.is_public, false) INTO v_is_public FROM user_profiles up WHERE up.id = p_user_id;
  IF NOT v_is_owner AND NOT COALESCE(v_is_public, false) THEN RETURN; END IF;

  RETURN QUERY
    SELECT uc.species, uc.first_observed_at, uc.info_types_seen, uc.municipalities_seen, uc.verified_count
    FROM user_collection uc
    WHERE uc.user_id = p_user_id
    ORDER BY uc.first_observed_at NULLS LAST, uc.species;
END;
$$;

COMMIT;
