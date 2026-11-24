-- REQ-125: AI 判定失敗の連続回数を投稿単位で追跡する。

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS ai_failure_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_posts_ai_failure_count
  ON public.posts (ai_failure_count)
  WHERE ai_failure_count >= 3;

COMMENT ON COLUMN public.posts.ai_failure_count IS
  'REQ-125: AI 判定が連続失敗した回数。成功時に 0 へ戻し、3 回以上は管理画面で再判定を抑制する。';
