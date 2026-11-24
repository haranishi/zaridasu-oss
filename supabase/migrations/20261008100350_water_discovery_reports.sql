-- Water discovery: private reports/photos, and a separate coarse public projection.
-- Reapplicable after Supabase default grants; no existing private table is changed.
BEGIN;

CREATE TABLE IF NOT EXISTS public.community_water_bodies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80 AND char_length(name) <= 80),
  lat numeric(7,3) NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng numeric(7,3) NOT NULL CHECK (lng BETWEEN -180 AND 180),
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.community_water_bodies IS
  'Reviewed public water locations. Only a checked name and coordinates rounded to three decimals; no report, owner, note or photo reference.';
CREATE INDEX IF NOT EXISTS idx_community_water_bodies_position ON public.community_water_bodies (lat, lng);

CREATE TABLE IF NOT EXISTS public.water_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id uuid NOT NULL,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80 AND char_length(name) <= 80),
  note text CHECK (note IS NULL OR char_length(note) <= 1000),
  lat numeric(10,7) NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng numeric(10,7) NOT NULL CHECK (lng BETWEEN -180 AND 180),
  photo_paths text[] NOT NULL CHECK (cardinality(photo_paths) BETWEEN 1 AND 3),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  public_name text CHECK (public_name IS NULL OR (char_length(btrim(public_name)) BETWEEN 1 AND 80 AND char_length(public_name) <= 80)),
  published_water_body_id uuid UNIQUE REFERENCES public.community_water_bodies(id),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT water_reports_user_client_key UNIQUE (user_id, client_id),
  CONSTRAINT water_reports_publication_matches CHECK ((status = 'accepted') = (published_water_body_id IS NOT NULL)),
  CONSTRAINT water_reports_review_time_matches CHECK ((status = 'pending') = (reviewed_at IS NULL))
);
COMMENT ON TABLE public.water_reports IS
  'Private unmapped-water reports, visible only to the owner and administrators. Photos remain private after review.';
CREATE INDEX IF NOT EXISTS idx_water_reports_user_created ON public.water_reports (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_water_reports_status_created ON public.water_reports (status, created_at DESC);

ALTER TABLE public.water_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_water_bodies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS water_reports_select_own_or_admin ON public.water_reports;
CREATE POLICY water_reports_select_own_or_admin ON public.water_reports FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id OR ((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');
DROP POLICY IF EXISTS water_reports_insert_own_pending ON public.water_reports;
CREATE POLICY water_reports_insert_own_pending ON public.water_reports FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id AND status = 'pending'
    AND public_name IS NULL AND published_water_body_id IS NULL AND reviewed_at IS NULL AND reviewed_by IS NULL);
DROP POLICY IF EXISTS water_reports_delete_own_or_admin ON public.water_reports;
CREATE POLICY water_reports_delete_own_or_admin ON public.water_reports FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id OR ((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');
DROP POLICY IF EXISTS community_water_bodies_public_read ON public.community_water_bodies;
CREATE POLICY community_water_bodies_public_read ON public.community_water_bodies FOR SELECT TO anon, authenticated USING (true);
REVOKE ALL ON public.water_reports FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.water_reports TO authenticated;
REVOKE ALL ON public.community_water_bodies FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.community_water_bodies TO anon, authenticated;

-- Validate on INSERT even for admin callers. Direct UPDATE is never granted: review uses the RPC.
CREATE OR REPLACE FUNCTION public.check_water_report_input()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_path text;
BEGIN
  IF NEW.status <> 'pending' OR NEW.public_name IS NOT NULL OR NEW.published_water_body_id IS NOT NULL
     OR NEW.reviewed_at IS NOT NULL OR NEW.reviewed_by IS NOT NULL THEN
    RAISE EXCEPTION 'A new water report must be pending and unreviewed' USING ERRCODE = '42501';
  END IF;
  NEW.created_at := now();
  IF NEW.photo_paths IS NULL OR cardinality(NEW.photo_paths) NOT BETWEEN 1 AND 3 THEN
    RAISE EXCEPTION 'Water reports require one to three photos' USING ERRCODE = '23514';
  END IF;
  FOREACH v_path IN ARRAY NEW.photo_paths LOOP
    IF v_path IS NULL OR v_path !~ ('^' || NEW.user_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$') THEN
      RAISE EXCEPTION 'Water report photos must be JPEG paths in the owner folder' USING ERRCODE = '42501';
    END IF;
  END LOOP;
  IF cardinality(NEW.photo_paths) <> (SELECT count(DISTINCT p) FROM unnest(NEW.photo_paths) AS p) THEN
    RAISE EXCEPTION 'Water report photos must be distinct' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.check_water_report_input() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS water_reports_validate_input ON public.water_reports;
CREATE TRIGGER water_reports_validate_input BEFORE INSERT ON public.water_reports FOR EACH ROW EXECUTE FUNCTION public.check_water_report_input();

CREATE OR REPLACE FUNCTION public.check_water_report_rate_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- BEFORE triggers run before INSERT's RLS WITH CHECK. Never count another owner's private rows.
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM NEW.user_id THEN
    RAISE EXCEPTION 'Water report owner must match the authenticated user' USING ERRCODE = '42501';
  END IF;
  -- Serialize concurrent submissions by one owner. Retried client IDs still reach the UNIQUE error.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW.user_id::text, 330081));
  IF EXISTS (SELECT 1 FROM public.water_reports WHERE user_id = NEW.user_id AND client_id = NEW.client_id) THEN RETURN NEW; END IF;
  IF (SELECT count(*) FROM public.water_reports WHERE user_id = NEW.user_id) >= 1000 THEN
    RAISE EXCEPTION 'Water report user limit exceeded' USING ERRCODE = 'P0001';
  END IF;
  IF (SELECT count(*) FROM public.water_reports WHERE user_id = NEW.user_id AND created_at >= now() - interval '1 hour') >= 20 THEN
    RAISE EXCEPTION 'Water report hourly limit exceeded' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.check_water_report_rate_limit() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS water_reports_rate_limit ON public.water_reports;
CREATE TRIGGER water_reports_rate_limit BEFORE INSERT ON public.water_reports FOR EACH ROW EXECUTE FUNCTION public.check_water_report_rate_limit();

-- Extend both existing audit enums, retaining all current actions.
ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_action_check;
ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_action_check CHECK (action IN (
  'delete_post', 'delete_comment', 'resolve_report', 'grant_admin', 'revoke_admin',
  'approve_post', 'reject_post', 'toggle_official', 'trigger_delete_post', 'trigger_status_change',
  'trigger_delete_comment', 'trigger_role_change', 'login_success', 'login_failed',
  'adopt_research', 'unadopt_research', 'review_water_report'
));
ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_target_type_check;
ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_target_type_check CHECK (target_type IN ('post', 'comment', 'report', 'user', 'water_report'));

CREATE OR REPLACE FUNCTION public.review_water_report(p_id uuid, p_status text, p_public_name text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_report public.water_reports%ROWTYPE; v_public_id uuid; v_name text; v_actor uuid;
BEGIN
  v_actor := auth.uid();
  IF v_actor IS NULL OR (auth.jwt() -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Administrator required' USING ERRCODE = '42501';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('accepted', 'rejected') THEN
    RAISE EXCEPTION 'Review status must be accepted or rejected' USING ERRCODE = '22023';
  END IF;
  v_name := btrim(p_public_name);
  IF p_status = 'accepted' AND (v_name IS NULL OR char_length(v_name) NOT BETWEEN 1 AND 80) THEN
    RAISE EXCEPTION 'A checked public name is required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_report FROM public.water_reports WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  v_public_id := v_report.published_water_body_id;
  IF p_status = 'accepted' THEN
    v_public_id := COALESCE(v_public_id, gen_random_uuid());
    INSERT INTO public.community_water_bodies (id, name, lat, lng)
      VALUES (v_public_id, v_name, round(v_report.lat, 3), round(v_report.lng, 3))
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, lat = EXCLUDED.lat, lng = EXCLUDED.lng;
  END IF;
  UPDATE public.water_reports SET status = p_status,
    public_name = CASE WHEN p_status = 'accepted' THEN v_name ELSE public_name END,
    published_water_body_id = CASE WHEN p_status = 'accepted' THEN v_public_id ELSE NULL END,
    reviewed_at = now(), reviewed_by = v_actor WHERE id = p_id;
  IF p_status = 'rejected' AND v_public_id IS NOT NULL THEN
    DELETE FROM public.community_water_bodies WHERE id = v_public_id;
  END IF;
  INSERT INTO public.audit_logs (admin_id, action, target_type, target_id, details)
    VALUES (v_actor, 'review_water_report', 'water_report', p_id,
      jsonb_build_object('previous_status', v_report.status, 'status', p_status));
  RETURN true;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.review_water_report(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_water_report(uuid, text, text) TO authenticated;

-- Account deletion or a report withdrawal must not leave its public projection behind.
CREATE OR REPLACE FUNCTION public.delete_water_report_publication()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF OLD.published_water_body_id IS NOT NULL THEN
    DELETE FROM public.community_water_bodies WHERE id = OLD.published_water_body_id;
  END IF;
  RETURN OLD;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.delete_water_report_publication() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS water_reports_delete_publication ON public.water_reports;
CREATE TRIGGER water_reports_delete_publication AFTER DELETE ON public.water_reports FOR EACH ROW EXECUTE FUNCTION public.delete_water_report_publication();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('water-report-photos', 'water-report-photos', false, 5242880, ARRAY['image/jpeg'])
  ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;
DROP POLICY IF EXISTS water_report_photos_insert_own ON storage.objects;
CREATE POLICY water_report_photos_insert_own ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'water-report-photos' AND name ~ ('^' || (SELECT auth.uid())::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$')
);
DROP POLICY IF EXISTS water_report_photos_select_own_or_admin ON storage.objects;
CREATE POLICY water_report_photos_select_own_or_admin ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'water-report-photos' AND ((storage.foldername(name))[1] = (SELECT auth.uid())::text
    OR ((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
);
DROP POLICY IF EXISTS water_report_photos_delete_own_or_admin ON storage.objects;
CREATE POLICY water_report_photos_delete_own_or_admin ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'water-report-photos' AND ((storage.foldername(name))[1] = (SELECT auth.uid())::text
    OR ((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
);

COMMIT;
