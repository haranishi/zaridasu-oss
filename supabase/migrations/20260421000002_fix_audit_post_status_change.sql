-- audit_post_status_change() が status 変更を audit_logs に書き込む際、
-- action='trigger_status_change' を使っていたが、audit_logs_action_check CHECK 制約は
-- ('delete_post','delete_comment','resolve_report','grant_admin','revoke_admin',
--  'approve_post','reject_post','toggle_official') しか許可していないため、
-- AI 自動承認・却下時の UPDATE が 23514 (check_violation) でロールバックされていた。
--
-- 症状: analyze-image / analyze-audio Edge Function が Gemini で正しく判定しても
-- posts 行が更新されず、ai_result が空 / status が pending のまま残る。
--
-- 対応: status に応じた正規の action 値 (approve_post / reject_post) に変換して書き込み、
-- 該当しない遷移 (pending 戻し等) が来た場合は check_violation を握りつぶしてトリガーを継続させる。

CREATE OR REPLACE FUNCTION public.audit_post_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO audit_logs (admin_id, action, target_type, target_id, details)
    VALUES (
      COALESCE(NEW.reviewed_by, auth.uid()),
      CASE
        WHEN NEW.status = 'approved' THEN 'approve_post'
        WHEN NEW.status = 'rejected' THEN 'reject_post'
        ELSE NULL
      END,
      'post',
      NEW.id,
      jsonb_build_object(
        'old_status', OLD.status,
        'new_status', NEW.status,
        'rejection_reason', NEW.rejection_reason,
        'auto_approved', NEW.auto_approved
      )
    )
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
EXCEPTION WHEN check_violation THEN
  -- 想定外の status 値や action=NULL が CHECK に引っかかった場合もトリガーは継続
  RETURN NEW;
END;
$function$;
