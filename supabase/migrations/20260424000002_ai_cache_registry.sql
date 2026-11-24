-- REQ-078 Phase 3: Gemini Context Caching の cache_id を管理するレジストリ。
-- Edge Function 起動時に有効な cache_id を lookup し、TTL 期限前に UPSERT で更新する。

CREATE TABLE IF NOT EXISTS public.ai_cache_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name text NOT NULL,
  model text NOT NULL,
  cache_id text NOT NULL,
  expires_at timestamptz NOT NULL,
  token_count int,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (function_name, model)
);

CREATE INDEX IF NOT EXISTS idx_ai_cache_expires
  ON public.ai_cache_registry (expires_at);

ALTER TABLE public.ai_cache_registry ENABLE ROW LEVEL SECURITY;

-- 明示ポリシー不要（service_role は RLS を bypass するため）。
-- authenticated / anon にはアクセス許可しない（ポリシー未定義）。

COMMENT ON TABLE public.ai_cache_registry IS
  'REQ-078: Gemini Context Caching の cache_id レジストリ。function_name+model でユニーク。';

-- updated_at の自動更新
CREATE OR REPLACE FUNCTION public.touch_ai_cache_registry() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_ai_cache_registry ON public.ai_cache_registry;
CREATE TRIGGER trg_touch_ai_cache_registry BEFORE UPDATE ON public.ai_cache_registry
  FOR EACH ROW EXECUTE FUNCTION public.touch_ai_cache_registry();
