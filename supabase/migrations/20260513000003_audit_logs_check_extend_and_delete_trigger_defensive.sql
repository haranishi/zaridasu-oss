-- 本番運用で発覚した「admin/posts の削除ボタンが効かない」事象 (REQ-126/127 関連調査) の修正。
--
-- 原因:
--   20240101000001_rls_and_audit_triggers.sql は audit_logs_action_check を拡張する
--   ALTER 文を含んでいたが、当該 migration が一度本番適用された後に CHECK 値を追加する
--   形で再編集されたため、Supabase CLI は version 単位で「適用済み」と判定して
--   再実行せず、本番 DB の CHECK 制約は古いまま (trigger_delete_post を含まない)
--   状態で残存。audit_post_delete トリガーが INSERT 時に 23514 で失敗し、
--   posts への DELETE がロールバックされていた。
--
-- 対応 (二段構え):
--   1. audit_logs_action_check を DROP → ADD で確実に最新値に揃える (べき等)
--   2. audit_post_delete / audit_comment_delete を 20260421000002 と同様に
--      EXCEPTION WHEN check_violation で握りつぶす形に書き直し、将来同類の
--      action 値追加忘れがあっても本体 DELETE 自体は止めない防御層を入れる。

----------------------------------------------------------------------
-- 1. audit_logs.action の許可値を最新に揃える
----------------------------------------------------------------------
ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_action_check;
ALTER TABLE public.audit_logs
  ADD CONSTRAINT audit_logs_action_check
  CHECK (action IN (
    'delete_post', 'delete_comment', 'resolve_report',
    'grant_admin', 'revoke_admin',
    'approve_post', 'reject_post', 'toggle_official',
    'trigger_delete_post', 'trigger_status_change',
    'trigger_delete_comment', 'trigger_role_change'
  ));

----------------------------------------------------------------------
-- 2. audit_post_delete: check_violation を握りつぶす防御を追加
----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_post_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO audit_logs (admin_id, action, target_type, target_id, details)
  VALUES (
    auth.uid(),  -- may be NULL for service-role deletions
    'trigger_delete_post',
    'post',
    OLD.id,
    jsonb_build_object(
      'species', OLD.species,
      'info_type', OLD.info_type,
      'municipality', OLD.municipality,
      'status', OLD.status,
      'user_id', OLD.user_id,
      'created_at', OLD.created_at
    )
  );
  RETURN OLD;
EXCEPTION WHEN check_violation THEN
  -- audit_logs_action_check に該当 action 値がまだ追加されていないなどで
  -- INSERT が失敗しても、本体の DELETE は完遂させる。
  RETURN OLD;
END;
$$;

----------------------------------------------------------------------
-- 3. audit_comment_delete も同等の防御を入れる (同じ原因で comment DELETE
--    が落ちる可能性があるため横展開)
----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_comment_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO audit_logs (admin_id, action, target_type, target_id, details)
  VALUES (
    auth.uid(),
    'trigger_delete_comment',
    'comment',
    OLD.id,
    jsonb_build_object(
      'post_id', OLD.post_id,
      'user_id', OLD.user_id,
      'content_preview', LEFT(OLD.content, 100),
      'created_at', OLD.created_at
    )
  );
  RETURN OLD;
EXCEPTION WHEN check_violation THEN
  RETURN OLD;
END;
$$;
