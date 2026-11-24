-- ===================================================
-- REQ-221: Supabase 本番ハードニング（最小権限の土台 / search_path 固定 /
--          security_invoker 統一）＋ set_user_admin_role 権限昇格バグ修正
--
-- 背景:
--   ザリダスは anon（publishable）キーで PostgREST を直接叩くクライアント直結構成で、
--   防御線はアプリではなく DB 側にある。本マイグレーションは RLS（行）/ 列 REVOKE /
--   列固定トリガー（既存 REQ）の「一段外・一段下」にあたる以下を冪等に締める：
--     (1) PUBLIC 擬似ロールの不要権限（CREATE / 関数の自動 EXECUTE）を閉じる最小権限の土台
--     (2) SECURITY DEFINER 関数 2 件の search_path 固定（Splinter 0011）
--     (3) admin_user_list ビューの security_invoker 統一（Splinter 0010）
--     (4) ★set_user_admin_role の権限昇格バグ修正（NULL caller_role の取りこぼし）
--
--   schema.sql（本番正本）と本マイグレーションの定義は一致させる（ドリフト防止）。
--   過去マイグレーションは改変せず、本連番で追補する。すべて再実行可能（冪等）。
--
--   注: 本マイグレーションは「コードで安全に閉じられる低リスクの土台」のみを含む。
--       テーブル単位の広範な GRANT/REVOKE 見直し（内部テーブルの anon/authenticated 権限
--       排除や Exposed schemas のスキーマ移設など）は、本番実 DB の実権限点検が必要で
--       回帰リスクが高いため、docs/runbooks/supabase-hardening-checklist.md の手動手順に回す。
-- ===================================================

-- ---------------------------------------------------
-- (1) 最小権限の土台（FR-221-01）
-- ---------------------------------------------------
-- public スキーマへの CREATE 権限を PUBLIC から剥奪。anon/authenticated が public に
-- オブジェクトを作る正当な理由は無い。CREATE のみの剥奪で、既存の
-- SELECT/INSERT/UPDATE/DELETE/EXECUTE には影響しない。再実行可能。
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- これ以降 public スキーマに作られる関数の、PUBLIC への自動 EXECUTE 付与を止める。
-- 必要な関数には個別 GRANT EXECUTE ... TO anon, authenticated が付いている前提（最小権限）。
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- 既にデプロイ済み DB では、過去に作られた関数に PUBLIC への暗黙 EXECUTE が残り得る。
-- 必要な実行権は各関数の明示 GRANT（... TO anon/authenticated/service_role）で保証されているため、
-- PUBLIC の暗黙 EXECUTE は剥がして「明示付与のみ実行可」に揃える。これは PUBLIC 擬似ロールに
-- 対する剥奪であり、anon/authenticated/service_role への明示 GRANT は維持される。
DO $$
BEGIN
  EXECUTE 'REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC';
EXCEPTION WHEN insufficient_privilege THEN
  -- 所有者でないロールで適用された場合は no-op（runbook の手動点検に委ねる）
  RAISE NOTICE 'REQ-221: REVOKE EXECUTE ... FROM PUBLIC をスキップ（権限不足）';
END $$;

-- ---------------------------------------------------
-- (2) SECURITY DEFINER 関数の search_path 固定（FR-221-02）
--     schema.sql の定義と一致させる。本体ロジックは従来どおり（挙動不変）。
-- ---------------------------------------------------

-- 新規ユーザー登録時に user_profiles を自動作成（Google OAuth 等）
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, display_name, avatar_emoji)
  VALUES (
    NEW.id,
    LEFT(
      COALESCE(
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'name',
        '名無し'
      ),
      20
    ),
    '🦞'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 調査依頼レート制限（1日3件まで）
CREATE OR REPLACE FUNCTION check_survey_request_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF (SELECT raw_app_meta_data->>'role' FROM auth.users WHERE id = NEW.user_id) = 'admin' THEN
    RETURN NEW;
  END IF;
  IF (
    SELECT COUNT(*) FROM survey_requests
    WHERE user_id = NEW.user_id AND created_at > NOW() - INTERVAL '24 hours'
  ) >= 3 THEN
    RAISE EXCEPTION '調査依頼は1日3件までです';
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------
-- (3) admin_user_list ビューの security_invoker 統一（FR-221-03）
--     他ビュー（posts_public / survey_request_timeline / ai_call_logs_daily）と設計を揃える。
--     auth.users 由来列の露出は REVOKE + get_admin_user_list() 経由限定で引き続き保護。
-- ---------------------------------------------------
ALTER VIEW IF EXISTS public.admin_user_list SET (security_invoker = true);

-- 一般ロールからの直接 SELECT を再度明示的に閉じる（再実行可能・冪等）。
REVOKE SELECT ON public.admin_user_list FROM authenticated;
REVOKE SELECT ON public.admin_user_list FROM anon;

-- ---------------------------------------------------
-- (4) ★set_user_admin_role 権限昇格バグ修正（最優先）
--
--   旧: IF caller_role != 'admin' THEN ...
--       呼び出し元の raw_app_meta_data に role キーが無く caller_role が NULL の場合
--       （role 未設定の一般ユーザー、または admin 剥奪後のユーザー）、`NULL != 'admin'` は
--       NULL（=偽）と評価され例外が発火せず、role を持たないユーザーが他者を admin に
--       昇格できてしまう権限昇格バグだった。
--   新: IF caller_role IS DISTINCT FROM 'admin' THEN ...
--       NULL も非 admin として正しく弾く。
--   本体の他ロジック（自己操作禁止・付与/剥奪 UPDATE）は schema.sql と同一（挙動不変）。
-- ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_user_admin_role(target_user_id UUID, grant_admin BOOLEAN)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role TEXT;
BEGIN
  -- 呼び出し元が管理者かチェック
  SELECT raw_app_meta_data->>'role' INTO caller_role
  FROM auth.users WHERE id = auth.uid();

  -- REQ-214/REQ-221: caller_role が NULL の場合も非 admin として弾く（権限昇格バグ修正）。
  IF caller_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION '管理者権限が必要です';
  END IF;

  -- 自分自身の権限は変更不可
  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION '自分自身の管理者権限は変更できません';
  END IF;

  IF grant_admin THEN
    UPDATE auth.users
    SET raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role": "admin"}'::jsonb
    WHERE id = target_user_id;
  ELSE
    UPDATE auth.users
    SET raw_app_meta_data = raw_app_meta_data - 'role'
    WHERE id = target_user_id;
  END IF;
END;
$$;
