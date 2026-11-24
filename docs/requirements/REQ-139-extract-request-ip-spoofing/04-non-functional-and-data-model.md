### 非機能要件

- [ ] **NFR-139-01: 後方互換性**
  既存の rate limit 挙動（認証ユーザー 24 時間 5 件、匿名 1 分 3 件 / 24 時間 10 件）の数値は変更しない。`extract_request_ip()` の戻り値が変わることで rate limit の集計対象が変わる点のみ受入れる（過去 24 時間の集計結果が一時的に変動する可能性あり）。

- [ ] **NFR-139-02: パフォーマンス**
  関数内処理が増えるが、`string_to_array` + `array_length` は O(n) 文字列スキャンに収まる。INSERT trigger 全体のレイテンシ増加は 5ms 以下を目標。

- [ ] **NFR-139-03: セキュリティ**
  - `cf-connecting-ip` を信頼することは「Supabase が Cloudflare 経由」である前提に依存する。Supabase の現行アーキテクチャ（2026 年現在）で Cloudflare エッジが手前にいることを確認のうえ採用する。確認できない場合は `x-forwarded-for` の末尾のみを採用する戦略に切り替える。
  - `user_agent` 値の保存は `md5` ハッシュとし、生の UA 文字列は保存しない（PII / fingerprinting 観点）。

- [ ] **NFR-139-04: 可観測性**
  `extract_request_ip()` が NULL を返したケースを集計できるよう、`ai_call_logs` 等の既存ログテーブルに依存せず、`check_post_rate_limit()` 内で NULL 時のカウントを admin dashboard で表示できるようにする（本要件では migration のみ。UI は別 REQ）。

### データモデル変更

```sql
-- supabase/migrations/20260512000002_extract_request_ip_hardening.sql

-- 1) extract_request_ip を末尾 / cf-connecting-ip 優先に
CREATE OR REPLACE FUNCTION public.extract_request_ip() RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
-- (FR-139-01 の本体)
$$;

-- 2) reporter_ua_hash カラム追加
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS reporter_ua_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_posts_reporter_ip_ua_created
  ON public.posts (reporter_ip, reporter_ua_hash, created_at DESC);

-- 3) set_post_reporter_ip trigger に UA hash 追加
CREATE OR REPLACE FUNCTION public.set_post_reporter_ip() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  headers JSONB := COALESCE(current_setting('request.headers', true)::jsonb, '{}'::jsonb);
  ua TEXT;
BEGIN
  IF NEW.user_id IS NULL AND NEW.reporter_ip IS NULL THEN
    NEW.reporter_ip := public.extract_request_ip();
  END IF;
  IF NEW.user_id IS NULL AND NEW.reporter_ua_hash IS NULL THEN
    ua := COALESCE(headers ->> 'user-agent', '');
    IF ua <> '' THEN NEW.reporter_ua_hash := md5(ua); END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 4) check_post_rate_limit を (ip, ua_hash) ペアで判定するよう更新
CREATE OR REPLACE FUNCTION public.check_post_rate_limit() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
-- (FR-139-02 の本体)
$$;

-- 5) system_settings に匿名投稿スイッチ追加
ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS anonymous_post_enabled BOOLEAN NOT NULL DEFAULT TRUE;
```
