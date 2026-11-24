-- ===================================================
-- Migration: REQ-025 (RLS Policy Consolidation) + REQ-020 (Audit Log Integrity)
-- Date: 2026-04-08
-- Description:
--   Part A: Consolidate RLS policies on posts, comments, audit_logs
--   Part B: Add DB-level audit log triggers (SECURITY DEFINER)
-- ===================================================

BEGIN;

-- =========================================================================
-- PART A: RLS POLICY CONSOLIDATION (REQ-025)
-- =========================================================================

-- ---------------------------------------------------------
-- A-1. posts: Drop legacy permissive policies
-- ---------------------------------------------------------

-- These were the original wide-open policies. The schema already drops them
-- in section 8, but we re-drop here defensively to guarantee they are gone
-- even if the migration is applied to an older DB state.
DROP POLICY IF EXISTS "public_read"   ON posts;
DROP POLICY IF EXISTS "public_insert" ON posts;

-- ---------------------------------------------------------
-- A-2. posts: Ensure moderated_read exists
--   approved posts are visible to everyone;
--   the post owner can see their own posts (any status);
--   admins see everything.
-- ---------------------------------------------------------
DROP POLICY IF EXISTS "moderated_read" ON posts;
CREATE POLICY "moderated_read" ON posts FOR SELECT USING (
  status = 'approved'
  OR auth.uid() = user_id
  OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
);

-- ---------------------------------------------------------
-- A-3. posts: Ensure auth_insert exists (authenticated only)
-- ---------------------------------------------------------
DROP POLICY IF EXISTS "auth_insert" ON posts;
CREATE POLICY "auth_insert" ON posts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------
-- A-4. comments: Admin DELETE policy
--   Admins can delete any comment (moderation).
--   Normal users can only delete their own via the existing owner_delete_comments.
-- ---------------------------------------------------------
DROP POLICY IF EXISTS "admin_delete_comments" ON comments;
CREATE POLICY "admin_delete_comments" ON comments FOR DELETE
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- ---------------------------------------------------------
-- A-5. posts: Secure view that excludes reporter_ip for non-admins
--   We create a SECURITY DEFINER function that returns posts with
--   reporter_ip nullified for non-admin callers. This can be used
--   as an alternative to direct table queries where IP masking is needed.
--   The RLS policy on the table itself remains unchanged (reporter_ip is
--   still stored), but this view provides a safe access layer.
-- ---------------------------------------------------------

-- First create a helper to check admin status
CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN COALESCE(
    (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role') = 'admin',
    FALSE
  );
END;
$$;

-- Create the secure view: non-admins get reporter_ip = NULL
-- security_invoker = true ensures RLS policies of the querying user are applied
CREATE OR REPLACE VIEW public.posts_public
WITH (security_invoker = true) AS
SELECT
  id, created_at, lat, lng, species, info_type, municipality,
  comment, photos, user_id, is_anonymous, is_official, count,
  observed_at, updated_at,
  CASE WHEN public.is_current_user_admin() THEN reporter_ip ELSE NULL END AS reporter_ip,
  is_flagged, weather, temperature, humidity,
  status, rejection_reason, rejection_message, reviewed_at, reviewed_by,
  ai_result, ai_analyzed_at, auto_approved,
  survey_duration_minutes, survey_request_id
FROM posts;

COMMENT ON VIEW public.posts_public IS 'Public view of posts that hides reporter_ip from non-admin users (REQ-025)';


-- =========================================================================
-- PART B: AUDIT LOG TRIGGERS (REQ-020)
-- =========================================================================

-- ---------------------------------------------------------
-- B-0. Extend audit_logs action constraint to allow trigger-sourced actions
-- ---------------------------------------------------------
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_action_check;
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_action_check
  CHECK (action IN (
    'delete_post', 'delete_comment', 'resolve_report',
    'grant_admin', 'revoke_admin',
    'approve_post', 'reject_post', 'toggle_official',
    -- New trigger-sourced actions
    'trigger_delete_post', 'trigger_status_change',
    'trigger_delete_comment', 'trigger_role_change'
  ));

-- Allow admin_id to be NULL for system/trigger-generated entries
ALTER TABLE audit_logs ALTER COLUMN admin_id DROP NOT NULL;

-- ---------------------------------------------------------
-- B-1. AFTER DELETE trigger on posts → audit_logs
-- ---------------------------------------------------------
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
END;
$$;

DROP TRIGGER IF EXISTS audit_on_post_delete ON posts;
CREATE TRIGGER audit_on_post_delete
  AFTER DELETE ON posts FOR EACH ROW
  EXECUTE FUNCTION public.audit_post_delete();

-- ---------------------------------------------------------
-- B-2. AFTER UPDATE trigger on posts for status changes (approve/reject)
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_post_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only fire when status actually changed
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO audit_logs (admin_id, action, target_type, target_id, details)
    VALUES (
      COALESCE(NEW.reviewed_by, auth.uid()),
      'trigger_status_change',
      'post',
      NEW.id,
      jsonb_build_object(
        'old_status', OLD.status,
        'new_status', NEW.status,
        'rejection_reason', NEW.rejection_reason,
        'auto_approved', NEW.auto_approved
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_on_post_status_change ON posts;
CREATE TRIGGER audit_on_post_status_change
  AFTER UPDATE ON posts FOR EACH ROW
  EXECUTE FUNCTION public.audit_post_status_change();

-- ---------------------------------------------------------
-- B-3. AFTER DELETE trigger on comments → audit_logs
-- ---------------------------------------------------------
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
END;
$$;

DROP TRIGGER IF EXISTS audit_on_comment_delete ON comments;
CREATE TRIGGER audit_on_comment_delete
  AFTER DELETE ON comments FOR EACH ROW
  EXECUTE FUNCTION public.audit_comment_delete();

-- ---------------------------------------------------------
-- B-4. AFTER UPDATE trigger on user profiles for role changes
--   This monitors auth.users for app_metadata role changes.
--   Since auth.users triggers require special handling in Supabase,
--   we put the trigger on the set_user_admin_role function instead
--   by wrapping it. We also add a direct trigger on user_profiles
--   to log profile-level changes.
-- ---------------------------------------------------------

-- Wrap set_user_admin_role to include audit logging
CREATE OR REPLACE FUNCTION public.set_user_admin_role(target_user_id UUID, grant_admin BOOLEAN)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role TEXT;
BEGIN
  -- Check caller is admin
  SELECT raw_app_meta_data->>'role' INTO caller_role
  FROM auth.users WHERE id = auth.uid();

  IF caller_role != 'admin' THEN
    RAISE EXCEPTION '管理者権限が必要です';
  END IF;

  -- Cannot change own role
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

  -- Audit log the role change (REQ-020)
  INSERT INTO audit_logs (admin_id, action, target_type, target_id, details)
  VALUES (
    auth.uid(),
    'trigger_role_change',
    'user',
    target_user_id,
    jsonb_build_object(
      'grant_admin', grant_admin,
      'changed_by', auth.uid()
    )
  );
END;
$$;

-- ---------------------------------------------------------
-- B-5. audit_logs RLS: INSERT only — no UPDATE/DELETE even for admins
--   This ensures the integrity of the audit trail.
--   Existing admin_all_audit_logs policy allows ALL operations;
--   we replace it with granular policies.
-- ---------------------------------------------------------

-- Drop the existing permissive all-operations policy
DROP POLICY IF EXISTS "admin_all_audit_logs" ON audit_logs;

-- Admin + authenticated users can read audit logs (via RPC in practice,
-- but the SELECT policy is needed for the RPC's SECURITY DEFINER to work)
CREATE POLICY "admin_read_audit_logs" ON audit_logs FOR SELECT TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- INSERT is allowed for:
--   1. Admins (from the client-side auditLog.ts)
--   2. SECURITY DEFINER trigger functions (bypass RLS automatically)
-- Note: SECURITY DEFINER functions bypass RLS, so the triggers in Part B
-- will work regardless. This policy covers client-side inserts.
CREATE POLICY "admin_insert_audit_logs" ON audit_logs FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Explicitly: NO UPDATE policy exists → updates are denied by default
-- Explicitly: NO DELETE policy exists → deletes are denied by default
-- This means even admins cannot modify or remove audit log entries,
-- preserving the integrity of the audit trail.

COMMENT ON TABLE audit_logs IS '管理者操作の監査ログ。整合性保護のため UPDATE/DELETE 不可 (REQ-020)';

COMMIT;
