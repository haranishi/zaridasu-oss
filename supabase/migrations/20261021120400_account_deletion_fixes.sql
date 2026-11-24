-- security-hardening 要件5: 投稿のある会員が、自分で退会できなかった不具合の修正（と、監査ログによる退会の阻止）。
--
-- 原因1: protect_post_status は、一般ユーザーの UPDATE で posts.user_id を旧値に戻す（所有者の付け替え防止）。
--   退会（delete_own_account → auth.users の DELETE）では、外部キー ON DELETE SET NULL が posts.user_id を
--   NULL にする更新を行うが、その更新も同じトリガーで旧値に戻される。結果、削除された利用者を指す行が残り、
--   posts_user_id_fkey 違反で退会が失敗する。投稿が 1 件も無い会員と、service_role による削除は成功する。
--   2026-10-21 に、CI 相当の手元 DB で再現した。
-- 修正1: 旧い持ち主が auth.users から既に消えているときだけ、NULL への更新を通す。生きている持ち主の投稿を
--   NULL や他人に書き換える更新は、従来どおり旧値に戻す。
-- 原因2: audit_logs.admin_id は auth.users への外部キー（NO ACTION）。一般会員が自分の投稿・コメントを削除すると、
--   監査のトリガーが本人の ID を admin_id に記録するため、以後その会員は退会が外部キー違反で失敗する。
-- 修正2: ON DELETE SET NULL にする。監査ログの行は消さず、記録者の欄だけ空にする（login_failed など、
--   admin_id が元から NULL の行もある）。
-- 退会後のコメントの扱い（schema.sql は匿名で残す／migration 20260323000001 は消す）は、食い違ったまま。
--   本人の判断待ちのため、この migration では変えない（.kiro/specs/security-hardening/brief.md）。
BEGIN;

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

  -- JWT なし または service_role は許可（Edge Function の自動承認）
  IF jwt_claims IS NULL OR jwt_claims = '{}'::jsonb THEN
    RETURN NEW;
  END IF;
  IF (jwt_claims ->> 'role') = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- 一般ユーザー (= 非 admin) は以下の管理系カラムを OLD 固定
  IF (jwt_claims -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'admin' THEN
    -- status 系 (REQ-034)
    NEW.status                  := OLD.status;
    NEW.rejection_reason        := OLD.rejection_reason;
    NEW.rejection_message       := OLD.rejection_message;
    NEW.reviewed_at             := OLD.reviewed_at;
    NEW.reviewed_by             := OLD.reviewed_by;
    NEW.auto_approved           := OLD.auto_approved;
    -- 運用制御 (REQ-034 / REQ-136)
    NEW.is_official             := OLD.is_official;
    NEW.is_flagged              := OLD.is_flagged;
    NEW.reporter_ip             := OLD.reporter_ip;
    -- AI 関連 (REQ-034 / REQ-125 / REQ-128 / REQ-136)
    NEW.ai_result               := OLD.ai_result;
    NEW.ai_analyzed_at          := OLD.ai_analyzed_at;
    NEW.ai_failure_count        := OLD.ai_failure_count;
    -- hash 改竄禁止 (REQ-079)
    NEW.audio_hash              := OLD.audio_hash;
    NEW.image_hashes            := OLD.image_hashes;
    -- 音声 (REQ-070 / REQ-082 / REQ-083 / REQ-136)
    NEW.audio_url               := OLD.audio_url;
    NEW.audio_duration_ms       := OLD.audio_duration_ms;
    -- 気象 (REQ-051 系 / REQ-136)
    NEW.weather                 := OLD.weather;
    NEW.temperature             := OLD.temperature;
    NEW.humidity                := OLD.humidity;
    -- 位置精度 (REQ-172): INSERT 時の値は本人の測位として許容するが、UPDATE では改竄禁止
    NEW.accuracy                := OLD.accuracy;
    -- 調査依頼 (REQ-084 系 / REQ-136)
    NEW.survey_request_id       := OLD.survey_request_id;
    NEW.survey_duration_minutes := OLD.survey_duration_minutes;
    -- 地理メタデータ (REQ-231): server enrichment 専用列。一般ユーザー改竄禁止
    NEW.locality                := OLD.locality;
    NEW.water_body              := OLD.water_body;
    NEW.is_on_water             := OLD.is_on_water;
    NEW.elevation_m             := OLD.elevation_m;
    NEW.geo_enriched_at         := OLD.geo_enriched_at;
    NEW.geo_source              := OLD.geo_source;
    -- 研究採用 (REQ-234): 管理者/サービスロール専用列。一般ユーザー改竄禁止。
    NEW.research_adopted_at          := OLD.research_adopted_at;
    NEW.research_adopted_notified_at := OLD.research_adopted_notified_at;
    -- 位置公開レベル (REQ-243 / REQ-329): 投稿者ができるのは「非公開（hidden）にする」ことだけ。
    -- 公開へ戻す・精度を上げる（coarsened → precise 等）は管理者だけ。管理者が伏せた記録も戻せない。
    IF NEW.location_disclosure IS DISTINCT FROM 'hidden' THEN
      NEW.location_disclosure   := OLD.location_disclosure;
    END IF;
    -- 所有権 (二重防御。policy でも守られるがトリガー側でも明示)
    -- ただし退会（auth.users の削除）だけは通す。外部キー ON DELETE SET NULL が、投稿の user_id を NULL にする
    -- 更新を行う。これまではここで旧値に戻され、投稿が 1 件でもある会員は退会できなかった
    -- （security-hardening 要件5）。通すのは「旧い持ち主が auth.users からもう消えている」ときだけ。
    -- 生きている持ち主の投稿を NULL や他人へ書き換える更新は、従来どおり旧値に戻す。
    IF NOT (NEW.user_id IS NULL AND OLD.user_id IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = OLD.user_id)) THEN
      NEW.user_id               := OLD.user_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  v_con text;
BEGIN
  SELECT c.conname INTO v_con
    FROM pg_constraint c
   WHERE c.conrelid = 'public.audit_logs'::regclass
     AND c.contype = 'f'
     AND c.confrelid = 'auth.users'::regclass
     AND c.conkey = ARRAY[(SELECT a.attnum FROM pg_attribute a
                            WHERE a.attrelid = 'public.audit_logs'::regclass AND a.attname = 'admin_id')];
  IF v_con IS NULL THEN
    RAISE NOTICE 'audit_logs.admin_id の外部キーが見つからないため、変更しない';
    RETURN;
  END IF;
  IF (SELECT c.confdeltype FROM pg_constraint c
       WHERE c.conrelid = 'public.audit_logs'::regclass AND c.conname = v_con) = 'n' THEN
    RETURN; -- 既に ON DELETE SET NULL
  END IF;
  EXECUTE format('ALTER TABLE public.audit_logs DROP CONSTRAINT %I', v_con);
  EXECUTE format('ALTER TABLE public.audit_logs ADD CONSTRAINT %I FOREIGN KEY (admin_id) REFERENCES auth.users(id) ON DELETE SET NULL', v_con);
END
$$;

COMMIT;
