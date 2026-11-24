-- ════════════════════════════════════════════════════════════════════════════
-- REQ-234: 研究採用通知 + Resend ライフサイクルメール（リテンション）
--   schema.sql と同期（REQ-003 / NFR-234-04 方針）。過去 migration は改変しない。
--
-- 本 migration が作るもの:
--   1. user_profiles: ライフサイクル購読カテゴリ列 + 配信停止トークン（FR-234-02）
--   2. posts: 研究採用イベント列（research_adopted_at / research_adopted_notified_at）
--      + 保護トリガー追記（is_official とは意味を分離 / FR-234-04）
--   3. audit_logs: 採用操作 action 値の追加（adopt_research / unadopt_research）
--   4. lifecycle_email_log: 送信・配信停止ガードレール計測（FR-234-10 / NFR-234-02）
--   5. 最終活動日時ビュー user_last_active（休眠判定 + ヘルススコア土台 / FR-234-07）
--   6. RPC 群（SECURITY DEFINER + search_path・PII 最小）:
--      - resolve_unsubscribe_token / apply_unsubscribe（配信停止公開ルート用）
--      - get_dormant_users（14 日無活動・再送下限 / FR-234-06）
--      - get_weekly_digest_recipients / get_municipality_weekly_digest（週次 / FR-234-07）
--      - adopt_post_research（採用セット + audit + 1 回限り通知トリガー / FR-234-04/05）
--      - record_lifecycle_email / get_lifecycle_unsubscribe_rate（ガードレール）
--   7. pg_cron: 日次（休眠復帰）+ 週次（ダイジェスト）ジョブと pg_net ラッパ（FR-234-08）
--
-- 重要な制約:
--   - 到達性（SPF/DKIM/DMARC）は REQ-219 が主管。本 migration は List-Unsubscribe の
--     着地点（配信停止トークン + RPC）のみ用意する（docs/runbooks/lifecycle-notifications.md）。
--   - PII 最小（REQ-211 / NFR-234-03）: 配信停止トークンは auth.users.id を直載せしない
--     不透明なランダム値。集計 RPC は市区町村粒度まで（座標・IP は返さない）。
--   - pg_cron / pg_net / Vault は本番ダッシュボード依存。未有効環境では no-op で安全に失敗
--     （fail-soft / NFR-234-01。既存 20260425000004 / 20260615000004 と同方針）。
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. user_profiles: ライフサイクル購読カテゴリ + 配信停止トークン（FR-234-02 / AC-02）
--    既存 notify_survey_request / notify_response_digest（20260425000004）と同じ
--    boolean NOT NULL DEFAULT true の様式に揃える。
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS notify_research_adopted  boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_dormant_reengage  boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_weekly_digest     boolean NOT NULL DEFAULT true,
  -- 配信停止トークン: auth.users.id を URL に載せない不透明なランダム値（列挙・推測耐性 / NFR-234-03）。
  -- gen_random_uuid() を文字列化。漏洩・ローテーション時は本人が再生成できる（rotate_unsubscribe_token）。
  ADD COLUMN IF NOT EXISTS unsubscribe_token        uuid NOT NULL DEFAULT gen_random_uuid();

COMMENT ON COLUMN public.user_profiles.notify_research_adopted IS
  'REQ-234: 研究採用通知（あなたの観察が研究の集計に採用された）の opt-in フラグ';
COMMENT ON COLUMN public.user_profiles.notify_dormant_reengage IS
  'REQ-234: 休眠復帰メール（14 日無活動）の opt-in フラグ';
COMMENT ON COLUMN public.user_profiles.notify_weekly_digest IS
  'REQ-234: 週次ダイジェスト（近所の新着・人気の生きもの）の opt-in フラグ';
COMMENT ON COLUMN public.user_profiles.unsubscribe_token IS
  'REQ-234: List-Unsubscribe / 本文リンク用の不透明な配信停止トークン。auth.users.id を直載せしない（NFR-234-03）';

-- 既存行にもトークンを確実に付与（DEFAULT は新規行のみ。NOT NULL なので既に値は入るが二重防御）。
UPDATE public.user_profiles SET unsubscribe_token = gen_random_uuid() WHERE unsubscribe_token IS NULL;

-- トークン → ユーザ解決を O(1) にする一意インデックス。
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_unsubscribe_token
  ON public.user_profiles (unsubscribe_token);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. posts: 研究採用イベント列（FR-234-04）。is_official（マップ公開用）とは意味を分離。
--    - research_adopted_at         : 採用日時（NULL=未採用）
--    - research_adopted_notified_at: 採用通知済み日時（多重送信防止 / NFR-234-02）
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS research_adopted_at          timestamptz,
  ADD COLUMN IF NOT EXISTS research_adopted_notified_at timestamptz;

COMMENT ON COLUMN public.posts.research_adopted_at IS
  'REQ-234: 研究/集計に採用した日時。is_official（マップ公開）とは別の研究貢献イベント。管理者/サービスロールのみ更新可';
COMMENT ON COLUMN public.posts.research_adopted_notified_at IS
  'REQ-234: 採用通知を送信した日時。投稿あたり 1 回のみ送るための冪等マーカー（NFR-234-02）';

CREATE INDEX IF NOT EXISTS idx_posts_research_adopted
  ON public.posts (research_adopted_at)
  WHERE research_adopted_at IS NOT NULL;

-- 2-b. protect_post_status: 研究採用列を一般ユーザー UPDATE から保護（is_official と同設計 / FR-234-04）。
--   付与は管理者/サービスロールのみ。schema.sql 正本の protect_post_status() に追記カラムを足す
--   （NFR-234-04 / REQ-231 と同方針）。service_role / admin は素通り。
CREATE OR REPLACE FUNCTION public.protect_post_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  jwt_claims jsonb;
BEGIN
  BEGIN
    jwt_claims := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb;
  EXCEPTION WHEN OTHERS THEN
    RETURN NEW;
  END;

  IF jwt_claims IS NULL OR jwt_claims = '{}'::jsonb THEN
    RETURN NEW;
  END IF;
  IF (jwt_claims ->> 'role') = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF (jwt_claims -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'admin' THEN
    NEW.status                  := OLD.status;
    NEW.rejection_reason        := OLD.rejection_reason;
    NEW.rejection_message       := OLD.rejection_message;
    NEW.reviewed_at             := OLD.reviewed_at;
    NEW.reviewed_by             := OLD.reviewed_by;
    NEW.auto_approved           := OLD.auto_approved;
    NEW.is_official             := OLD.is_official;
    NEW.is_flagged              := OLD.is_flagged;
    NEW.reporter_ip             := OLD.reporter_ip;
    NEW.ai_result               := OLD.ai_result;
    NEW.ai_analyzed_at          := OLD.ai_analyzed_at;
    NEW.ai_failure_count        := OLD.ai_failure_count;
    NEW.audio_hash              := OLD.audio_hash;
    NEW.image_hashes            := OLD.image_hashes;
    NEW.audio_url               := OLD.audio_url;
    NEW.audio_duration_ms       := OLD.audio_duration_ms;
    NEW.weather                 := OLD.weather;
    NEW.temperature             := OLD.temperature;
    NEW.humidity                := OLD.humidity;
    NEW.accuracy                := OLD.accuracy;
    NEW.survey_request_id       := OLD.survey_request_id;
    NEW.survey_duration_minutes := OLD.survey_duration_minutes;
    -- 地理メタデータ (REQ-231)
    NEW.locality                := OLD.locality;
    NEW.water_body              := OLD.water_body;
    NEW.is_on_water             := OLD.is_on_water;
    NEW.elevation_m             := OLD.elevation_m;
    NEW.geo_enriched_at         := OLD.geo_enriched_at;
    NEW.geo_source              := OLD.geo_source;
    -- 研究採用 (REQ-234): 管理者/サービスロール専用列。一般ユーザー改竄禁止。
    NEW.research_adopted_at          := OLD.research_adopted_at;
    NEW.research_adopted_notified_at := OLD.research_adopted_notified_at;
    -- 所有権
    NEW.user_id                 := OLD.user_id;
  END IF;
  RETURN NEW;
END;
$$;
COMMENT ON FUNCTION public.protect_post_status() IS
  'REQ-034 / REQ-079 / REQ-083 / REQ-136 / REQ-231 / REQ-234: 一般ユーザー UPDATE 時、status/運用制御/AI/hash/音声/気象/調査/地理メタデータ/研究採用/所有権カラムを OLD に固定。admin / service_role は素通り。';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. audit_logs: 採用操作の action 値を追加（FR-234-04・AC-04）。最新版を再定義（追記）。
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_action_check;
ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_action_check
  CHECK (action IN (
    'delete_post', 'delete_comment', 'resolve_report',
    'grant_admin', 'revoke_admin',
    'approve_post', 'reject_post', 'toggle_official',
    'trigger_delete_post', 'trigger_status_change',
    'trigger_delete_comment', 'trigger_role_change',
    'login_success', 'login_failed',
    -- REQ-234: 研究採用イベント
    'adopt_research', 'unadopt_research'
  ));

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. lifecycle_email_log: ガードレール計測（FR-234-10 / AC-08 / NFR-234-02）。
--    送信・配信停止・bounce/complaint を category 別に記録し、配信停止率を監視する。
--    PII 最小: user_id は保持するが本文・座標・IP は保持しない。RLS 有効 + service_role のみ。
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lifecycle_email_log (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- 'research_adopted' | 'dormant_reengage' | 'weekly_digest'
  category    text        NOT NULL CHECK (category IN ('research_adopted', 'dormant_reengage', 'weekly_digest')),
  -- 'sent' | 'unsubscribed' | 'bounced' | 'complained'
  event       text        NOT NULL CHECK (event IN ('sent', 'unsubscribed', 'bounced', 'complained')),
  user_id     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  -- 関連投稿（研究採用通知のみ）。それ以外は NULL。
  post_id     uuid        REFERENCES public.posts(id) ON DELETE SET NULL,
  meta        jsonb
);
COMMENT ON TABLE public.lifecycle_email_log IS
  'REQ-234: ライフサイクルメールの送信/配信停止/bounce/complaint をカテゴリ別に記録（ガードレール計測 / FR-234-10）。PII 最小・service_role のみ。';

CREATE INDEX IF NOT EXISTS idx_lifecycle_email_log_cat_created
  ON public.lifecycle_email_log (category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lifecycle_email_log_user_cat
  ON public.lifecycle_email_log (user_id, category, created_at DESC);

ALTER TABLE public.lifecycle_email_log ENABLE ROW LEVEL SECURITY;
-- RLS 有効 + ポリシー無し = anon/authenticated 全拒否。Edge Function は service_role で RLS バイパス。
REVOKE ALL ON public.lifecycle_email_log FROM anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. user_last_active: 最終活動日時ビュー（FR-234-07 / AC-06）。
--    複数テーブル（posts / comments / auth.users.last_sign_in_at / user_profiles.updated_at）
--    の最終活動を 1 列に集約。休眠判定（FR-234-06）+ ヘルススコアの共通土台。
--    SECURITY: ビューは definer の権限で auth.users を読むため anon/authenticated に GRANT しない
--    （PII。Edge Function は service_role で参照）。
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.user_last_active AS
SELECT
  u.id AS user_id,
  GREATEST(
    COALESCE(u.last_sign_in_at, 'epoch'::timestamptz),
    COALESCE(up.updated_at,     'epoch'::timestamptz),
    COALESCE(p.last_post_at,    'epoch'::timestamptz),
    COALESCE(c.last_comment_at, 'epoch'::timestamptz)
  ) AS last_active_at,
  u.last_sign_in_at,
  p.last_post_at,
  c.last_comment_at
FROM auth.users u
LEFT JOIN public.user_profiles up ON up.id = u.id
LEFT JOIN (
  SELECT user_id, max(created_at) AS last_post_at
  FROM public.posts WHERE user_id IS NOT NULL GROUP BY user_id
) p ON p.user_id = u.id
LEFT JOIN (
  SELECT user_id, max(created_at) AS last_comment_at
  FROM public.comments WHERE user_id IS NOT NULL GROUP BY user_id
) c ON c.user_id = u.id;
COMMENT ON VIEW public.user_last_active IS
  'REQ-234: ユーザの最終活動日時（投稿/コメント/サインイン/プロフィール更新の最大）。休眠判定・ヘルススコアの土台。auth.users 参照のため service_role のみ。';
REVOKE ALL ON public.user_last_active FROM anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. RPC 群（すべて SECURITY DEFINER + SET search_path・PII 最小）
-- ─────────────────────────────────────────────────────────────────────────────

-- 6-a. resolve_unsubscribe_token: 配信停止トークンから user_id を解決（公開ルート用）。
--   トークンは不透明なため anon でも安全に叩ける。user_id は内部解決のみで露出しない設計だが、
--   公開ページが「どのカテゴリを stop したか」を表示するためフラグ状態を返す。
CREATE OR REPLACE FUNCTION public.resolve_unsubscribe_token(p_token uuid)
RETURNS TABLE (
  found boolean,
  notify_research_adopted boolean,
  notify_dormant_reengage boolean,
  notify_weekly_digest boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    true,
    up.notify_research_adopted,
    up.notify_dormant_reengage,
    up.notify_weekly_digest
  FROM public.user_profiles up
  WHERE up.unsubscribe_token = p_token
  LIMIT 1;
$$;
COMMENT ON FUNCTION public.resolve_unsubscribe_token(uuid) IS
  'REQ-234: 配信停止トークン→購読フラグ状態。user_id は露出しない（PII / NFR-234-03）。anon GRANT。';
GRANT EXECUTE ON FUNCTION public.resolve_unsubscribe_token(uuid) TO anon, authenticated;

-- 6-b. apply_unsubscribe: トークンで該当ユーザの 1 カテゴリ or 全ライフサイクルを opt-out。
--   p_category: 'research_adopted' | 'dormant_reengage' | 'weekly_digest' | 'all'
--   ログイン不要・トークン検証のみ（List-Unsubscribe ワンクリック着地点 / FR-234-03）。
CREATE OR REPLACE FUNCTION public.apply_unsubscribe(p_token uuid, p_category text DEFAULT 'all')
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM public.user_profiles WHERE unsubscribe_token = p_token LIMIT 1;
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  IF p_category = 'research_adopted' THEN
    UPDATE public.user_profiles SET notify_research_adopted = false WHERE id = v_uid;
  ELSIF p_category = 'dormant_reengage' THEN
    UPDATE public.user_profiles SET notify_dormant_reengage = false WHERE id = v_uid;
  ELSIF p_category = 'weekly_digest' THEN
    UPDATE public.user_profiles SET notify_weekly_digest = false WHERE id = v_uid;
  ELSE
    -- 'all' またはそれ以外: 全ライフサイクルメールを停止（取引通知 notify_survey_request は対象外）。
    UPDATE public.user_profiles
      SET notify_research_adopted = false,
          notify_dormant_reengage = false,
          notify_weekly_digest    = false
      WHERE id = v_uid;
  END IF;

  -- ガードレール計測（FR-234-10）: 配信停止イベントを記録。category='all' は weekly_digest 代表で記録。
  INSERT INTO public.lifecycle_email_log (category, event, user_id, meta)
  VALUES (
    CASE WHEN p_category IN ('research_adopted', 'dormant_reengage', 'weekly_digest')
         THEN p_category ELSE 'weekly_digest' END,
    'unsubscribed', v_uid,
    jsonb_build_object('source', 'list_unsubscribe', 'requested', p_category)
  );
  RETURN true;
END;
$$;
COMMENT ON FUNCTION public.apply_unsubscribe(uuid, text) IS
  'REQ-234: 配信停止トークンで 1 カテゴリ or 全ライフサイクルメールを opt-out（ワンクリック着地点 / FR-234-03）。';
GRANT EXECUTE ON FUNCTION public.apply_unsubscribe(uuid, text) TO anon, authenticated;

-- 6-c. get_dormant_users: 14 日無活動 + opt-in + 再送下限（30 日）を満たすユーザを抽出（FR-234-06 / AC-05）。
--   service_role のみ（auth.users / メール走査のため）。返すのは user_id と最終活動のみ（PII 最小）。
CREATE OR REPLACE FUNCTION public.get_dormant_users(
  p_dormant_days integer DEFAULT 14,
  p_resend_min_days integer DEFAULT 30,
  p_limit integer DEFAULT 200
)
RETURNS TABLE (user_id uuid, last_active_at timestamptz, municipality text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  -- municipality は user_profiles には無い（posts のカラム）。そのユーザーが投稿した
  -- 承認済み投稿の市区町村のうち最頻値を「代表地域」として導出する（同数はアルファベット順で 1 つ／
  -- 承認済み投稿が無ければ NULL）。EF（notify-dormant-reengage）はこれを「あなたの地域 ◯◯」に使う。
  SELECT la.user_id, la.last_active_at, m.municipality
  FROM public.user_last_active la
  JOIN public.user_profiles up ON up.id = la.user_id
  LEFT JOIN LATERAL (
    SELECT p.municipality
    FROM public.posts p
    WHERE p.user_id = la.user_id
      AND p.status = 'approved'
      AND p.municipality IS NOT NULL
    GROUP BY p.municipality
    ORDER BY count(*) DESC, p.municipality ASC
    LIMIT 1
  ) m ON true
  WHERE up.notify_dormant_reengage = true
    -- 直近 p_dormant_days に投稿・コメント・サインインが無い（プロフィール更新は活動に含めない=設定変更で除外されないように）
    AND COALESCE(la.last_post_at,    'epoch'::timestamptz) < now() - make_interval(days => p_dormant_days)
    AND COALESCE(la.last_comment_at, 'epoch'::timestamptz) < now() - make_interval(days => p_dormant_days)
    AND COALESCE(la.last_sign_in_at, 'epoch'::timestamptz) < now() - make_interval(days => p_dormant_days)
    -- 再送下限: 直近 p_resend_min_days に休眠復帰メールを送っていない（しつこい再送防止 / NFR-234-02）
    AND NOT EXISTS (
      SELECT 1 FROM public.lifecycle_email_log lel
      WHERE lel.user_id = la.user_id
        AND lel.category = 'dormant_reengage'
        AND lel.event = 'sent'
        AND lel.created_at > now() - make_interval(days => p_resend_min_days)
    )
  ORDER BY la.last_active_at ASC
  LIMIT p_limit;
$$;
COMMENT ON FUNCTION public.get_dormant_users(integer, integer, integer) IS
  'REQ-234: 14 日無活動 + opt-in + 再送下限を満たす休眠ユーザを抽出（FR-234-06）。service_role 専用。座標/IP/メールは返さない。';
REVOKE EXECUTE ON FUNCTION public.get_dormant_users(integer, integer, integer) FROM anon, authenticated;

-- 6-d. get_weekly_digest_recipients: 週次ダイジェスト対象ユーザ（opt-in・直近週に未送信）。
CREATE OR REPLACE FUNCTION public.get_weekly_digest_recipients(p_limit integer DEFAULT 500)
RETURNS TABLE (user_id uuid, municipality text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  -- municipality は posts から導出（user_profiles には無い）。承認済み投稿の市区町村の最頻値を
  -- 代表地域とし、代表地域が決まらない（＝承認済み投稿が無い）ユーザは対象外（NULL を除外）。
  SELECT up.id, m.municipality
  FROM public.user_profiles up
  JOIN LATERAL (
    SELECT p.municipality
    FROM public.posts p
    WHERE p.user_id = up.id
      AND p.status = 'approved'
      AND p.municipality IS NOT NULL
    GROUP BY p.municipality
    ORDER BY count(*) DESC, p.municipality ASC
    LIMIT 1
  ) m ON true
  WHERE up.notify_weekly_digest = true
    -- 直近 6 日以内に週次ダイジェストを送っていない（週 1 回保証 / NFR-234-02。pg_cron 二重発火対策）
    AND NOT EXISTS (
      SELECT 1 FROM public.lifecycle_email_log lel
      WHERE lel.user_id = up.id
        AND lel.category = 'weekly_digest'
        AND lel.event = 'sent'
        AND lel.created_at > now() - interval '6 days'
    )
  LIMIT p_limit;
$$;
COMMENT ON FUNCTION public.get_weekly_digest_recipients(integer) IS
  'REQ-234: 週次ダイジェスト対象（opt-in・市区町村あり・直近週未送信）。service_role 専用。';
REVOKE EXECUTE ON FUNCTION public.get_weekly_digest_recipients(integer) FROM anon, authenticated;

-- 6-e. get_municipality_weekly_digest: ある市区町村の直近 1 週間の集計（件数・種別内訳・人気）。
--   市区町村粒度のみ・座標/PII を返さない（NFR-234-03 / REQ-211）。既存集計 RPC と同思想。
CREATE OR REPLACE FUNCTION public.get_municipality_weekly_digest(p_municipality text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'municipality', p_municipality,
    'total', COALESCE((
      SELECT count(*) FROM public.posts
      WHERE municipality = p_municipality AND status = 'approved'
        AND created_at > now() - interval '7 days'
    ), 0),
    'by_species', COALESCE((
      SELECT jsonb_object_agg(species, cnt) FROM (
        SELECT species, count(*)::int AS cnt FROM public.posts
        WHERE municipality = p_municipality AND status = 'approved'
          AND created_at > now() - interval '7 days'
        GROUP BY species
      ) s
    ), '{}'::jsonb),
    'by_info_type', COALESCE((
      SELECT jsonb_object_agg(info_type, cnt) FROM (
        SELECT info_type, count(*)::int AS cnt FROM public.posts
        WHERE municipality = p_municipality AND status = 'approved'
          AND created_at > now() - interval '7 days'
        GROUP BY info_type
      ) i
    ), '{}'::jsonb)
  );
$$;
COMMENT ON FUNCTION public.get_municipality_weekly_digest(text) IS
  'REQ-234: 市区町村の直近 1 週間の承認済み投稿集計（件数・種別内訳）。座標/PII を返さない（NFR-234-03）。';
REVOKE EXECUTE ON FUNCTION public.get_municipality_weekly_digest(text) FROM anon, authenticated;

-- 6-f. adopt_post_research: 投稿を研究採用にセット（管理者操作）。audit + 1 回限り通知トリガー（FR-234-04/05）。
--   保護トリガーで一般ユーザーは research_adopted_at を書けないため、本 RPC は admin/service_role 経路で使う。
--   SECURITY DEFINER だが冒頭で呼び出し元の admin claim を必須化（昇格防止）。
CREATE OR REPLACE FUNCTION public.adopt_post_research(p_post_id uuid, p_adopt boolean DEFAULT true)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  jwt_claims jsonb;
  v_role text;
  v_actor uuid;
  v_user_id uuid;
  v_was timestamptz;
BEGIN
  BEGIN
    jwt_claims := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb;
  EXCEPTION WHEN OTHERS THEN
    jwt_claims := NULL;
  END;
  v_role := COALESCE(jwt_claims ->> 'role', '');
  -- 管理者 or service_role のみ（FR-234-04: 採用更新は管理者/サービスロール限定）。
  IF v_role <> 'service_role'
     AND (jwt_claims -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'forbidden: admin or service_role required';
  END IF;

  SELECT user_id, research_adopted_at INTO v_user_id, v_was FROM public.posts WHERE id = p_post_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF p_adopt THEN
    -- 既に採用済みなら通知済みマーカーは保持（多重送信防止 / NFR-234-02）。
    UPDATE public.posts
      SET research_adopted_at = COALESCE(research_adopted_at, now())
      WHERE id = p_post_id;
  ELSE
    -- 採用取消: フラグと通知済みマーカーをクリア（再採用時に再通知できる）。
    UPDATE public.posts
      SET research_adopted_at = NULL, research_adopted_notified_at = NULL
      WHERE id = p_post_id;
  END IF;

  -- 監査ログ（AC-04）。actor は admin の場合のみ sub を入れる。
  BEGIN
    v_actor := NULLIF(jwt_claims ->> 'sub', '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_actor := NULL;
  END;
  INSERT INTO public.audit_logs (admin_id, action, target_type, target_id, details)
  VALUES (
    v_actor,
    CASE WHEN p_adopt THEN 'adopt_research' ELSE 'unadopt_research' END,
    'post', p_post_id,
    jsonb_build_object('was_adopted', v_was IS NOT NULL)
  );

  -- 新規採用（未通知）かつ非匿名なら通知 Edge Function を起動（pg_net ラッパ・1 回限り）。
  IF p_adopt AND v_was IS NULL AND v_user_id IS NOT NULL THEN
    PERFORM public.call_notify_research_adopted(jsonb_build_object('post_id', p_post_id));
  END IF;
  RETURN true;
END;
$$;
COMMENT ON FUNCTION public.adopt_post_research(uuid, boolean) IS
  'REQ-234: 投稿を研究採用に設定/解除。admin/service_role 限定・audit 記録・新規採用時のみ 1 回通知（FR-234-04/05）。';
REVOKE EXECUTE ON FUNCTION public.adopt_post_research(uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.adopt_post_research(uuid, boolean) TO authenticated;

-- 6-g. record_lifecycle_email: Edge Function から送信/イベントを記録（ガードレール / FR-234-10）。
--   service_role のみ（lifecycle_email_log は RLS 全拒否なので Edge は service_role で直接 INSERT も可だが、
--   研究採用の notified_at セットを 1 トランザクションで行うため RPC を用意）。
CREATE OR REPLACE FUNCTION public.record_lifecycle_email(
  p_category text,
  p_user_id uuid,
  p_post_id uuid DEFAULT NULL,
  p_set_research_notified boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.lifecycle_email_log (category, event, user_id, post_id)
  VALUES (p_category, 'sent', p_user_id, p_post_id);

  IF p_set_research_notified AND p_post_id IS NOT NULL THEN
    UPDATE public.posts SET research_adopted_notified_at = COALESCE(research_adopted_notified_at, now())
      WHERE id = p_post_id;
  END IF;
END;
$$;
COMMENT ON FUNCTION public.record_lifecycle_email(text, uuid, uuid, boolean) IS
  'REQ-234: ライフサイクルメール送信を記録し、研究採用は notified_at を 1 回セット（冪等 / NFR-234-02）。service_role 専用。';
REVOKE EXECUTE ON FUNCTION public.record_lifecycle_email(text, uuid, uuid, boolean) FROM anon, authenticated;

-- 6-h. get_lifecycle_unsubscribe_rate: カテゴリ別の配信停止率（直近 N 日）。運用監視用（FR-234-10 / AC-08）。
CREATE OR REPLACE FUNCTION public.get_lifecycle_unsubscribe_rate(p_days integer DEFAULT 30)
RETURNS TABLE (
  category text,
  sent_count bigint,
  unsub_count bigint,
  complaint_count bigint,
  unsubscribe_rate numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    cat.category,
    COALESCE(s.sent_count, 0)        AS sent_count,
    COALESCE(u.unsub_count, 0)       AS unsub_count,
    COALESCE(c.complaint_count, 0)   AS complaint_count,
    round(COALESCE(u.unsub_count, 0)::numeric / NULLIF(COALESCE(s.sent_count, 0), 0), 4) AS unsubscribe_rate
  FROM (VALUES ('research_adopted'), ('dormant_reengage'), ('weekly_digest')) AS cat(category)
  LEFT JOIN (
    SELECT category, count(*) AS sent_count FROM public.lifecycle_email_log
    WHERE event = 'sent' AND created_at > now() - make_interval(days => p_days) GROUP BY category
  ) s ON s.category = cat.category
  LEFT JOIN (
    SELECT category, count(*) AS unsub_count FROM public.lifecycle_email_log
    WHERE event = 'unsubscribed' AND created_at > now() - make_interval(days => p_days) GROUP BY category
  ) u ON u.category = cat.category
  LEFT JOIN (
    SELECT category, count(*) AS complaint_count FROM public.lifecycle_email_log
    WHERE event = 'complained' AND created_at > now() - make_interval(days => p_days) GROUP BY category
  ) c ON c.category = cat.category;
$$;
COMMENT ON FUNCTION public.get_lifecycle_unsubscribe_rate(integer) IS
  'REQ-234: カテゴリ別の配信停止率/苦情率（直近 N 日）。閾値超過時に頻度を下げる運用判断に使う（FR-234-10）。admin 集計用。';
REVOKE EXECUTE ON FUNCTION public.get_lifecycle_unsubscribe_rate(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_lifecycle_unsubscribe_rate(integer) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. pg_net ラッパ + pg_cron 定期ジョブ（FR-234-08 / AC-07）。
--    既存 call_notify_survey_request（20260425000004）と同パターン。
--    Vault / app.settings 未設定や pg_net/pg_cron 未有効では no-op（fail-soft / NFR-234-01）。
--    ※ migration 側にのみ定義（schema.sql 単独適用＝CI rls-tests では vault/pg_cron が無いため）。
--      既存 enrich-place / AI webhook と同じ「pg_net/cron トリガーは migration のみ」方針。
-- ─────────────────────────────────────────────────────────────────────────────

-- 共通: Edge Function を pg_net で叩く薄いラッパ（fail-soft）。
CREATE OR REPLACE FUNCTION public.call_lifecycle_edge_function(p_fn text, p_payload jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_url text;
  v_key text;
BEGIN
  BEGIN
    SELECT decrypted_secret INTO v_key
      FROM vault.decrypted_secrets WHERE name = 'edge_function_service_role_key' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    RETURN;  -- Vault 未設定環境（CI/ローカル）では no-op
  END;
  IF v_key IS NULL THEN RETURN; END IF;

  v_url := current_setting('app.settings.supabase_url', true);
  IF v_url IS NULL OR v_url = '' THEN
    v_url := 'https://project-not-configured.invalid';
  END IF;

  PERFORM net.http_post(
    url := v_url || '/functions/v1/' || p_fn,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := p_payload
  );
EXCEPTION WHEN OTHERS THEN
  NULL;  -- 起動失敗は本処理を止めない（fail-soft）
END;
$$;
COMMENT ON FUNCTION public.call_lifecycle_edge_function(text, jsonb) IS
  'REQ-234: ライフサイクル Edge Function を pg_net で起動する薄いラッパ。Vault/pg_net 未設定や失敗は no-op（fail-soft）。';

-- 研究採用通知の起動ラッパ（adopt_post_research から呼ばれる。schema.sql の adopt は本関数を参照）。
CREATE OR REPLACE FUNCTION public.call_notify_research_adopted(payload jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  PERFORM public.call_lifecycle_edge_function('notify-research-adopted', payload);
END;
$$;
COMMENT ON FUNCTION public.call_notify_research_adopted(jsonb) IS
  'REQ-234: 研究採用通知 Edge Function（notify-research-adopted）を pg_net で起動（fail-soft）。';

-- 日次（休眠復帰）/ 週次（ダイジェスト）ジョブの起動関数。cron から呼ぶ。
CREATE OR REPLACE FUNCTION public.run_dormant_reengage_batch()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  PERFORM public.call_lifecycle_edge_function('notify-dormant-reengage', '{}'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.run_weekly_digest_batch()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  PERFORM public.call_lifecycle_edge_function('notify-weekly-digest', '{}'::jsonb);
END;
$$;

-- pg_cron の登録（拡張が無い/未有効でも安全に no-op。NFR-234-01 / AC-07）。
DO $$
BEGIN
  -- pg_cron 拡張を有効化（権限が無い環境では EXCEPTION で握り潰す）。
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'REQ-234: pg_cron 拡張を有効化できません（権限/未対応環境）。cron ジョブはスキップ（fail-soft）。';
    RETURN;
  END;

  -- 既存の同名ジョブがあれば張り替え（冪等 / pg_cron 二重発火防止）。
  BEGIN
    PERFORM cron.unschedule('lifecycle_dormant_reengage_daily');
  EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN
    PERFORM cron.unschedule('lifecycle_weekly_digest');
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- 日次 09:00 UTC（= JST 18:00）に休眠復帰判定。
  BEGIN
    PERFORM cron.schedule('lifecycle_dormant_reengage_daily', '0 9 * * *',
      $cron$ SELECT public.run_dormant_reengage_batch(); $cron$);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'REQ-234: dormant_reengage cron 登録に失敗（fail-soft）。';
  END;

  -- 週次（毎週月曜 00:00 UTC = JST 月曜 09:00）にダイジェスト。
  BEGIN
    PERFORM cron.schedule('lifecycle_weekly_digest', '0 0 * * 1',
      $cron$ SELECT public.run_weekly_digest_batch(); $cron$);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'REQ-234: weekly_digest cron 登録に失敗（fail-soft）。';
  END;
END
$$;

COMMIT;
