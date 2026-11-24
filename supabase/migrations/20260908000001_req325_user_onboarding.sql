-- REQ-325: 回答は公開プロフィールから分離し、本人だけに公開する。
CREATE TABLE IF NOT EXISTS public.user_onboarding (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  region text NOT NULL CHECK (region IN ('akita_city', 'north', 'central', 'south', 'other')),
  seen_crayfish text NOT NULL CHECK (seen_crayfish IN ('yes', 'no', 'maybe')),
  onboarded_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_onboarding ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY onboarding_select_own ON public.user_onboarding
    FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY onboarding_insert_own ON public.user_onboarding
    FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY onboarding_update_own ON public.user_onboarding
    FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- DELETE ポリシーなし。退会時は auth.users の cascade で削除する。
REVOKE ALL ON public.user_onboarding FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.user_onboarding TO authenticated;

DROP TRIGGER IF EXISTS set_onboarding_updated_at ON public.user_onboarding;
CREATE TRIGGER set_onboarding_updated_at
  BEFORE UPDATE ON public.user_onboarding FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();
