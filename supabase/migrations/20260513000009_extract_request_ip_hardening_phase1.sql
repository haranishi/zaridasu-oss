-- REQ-139 Phase 1: extract_request_ip() の信頼ヘッダー優先順位変更
--
-- 背景:
--   旧実装は x-forwarded-for の「先頭」を信用していたため、クライアントが
--   `X-Forwarded-For: <偽装値>` を送るたびに rate limit を初回判定でバイパス可能だった。
--   Cloudflare 経由の Supabase エッジでは cf-connecting-ip がエッジで上書きされ偽装不能、
--   x-forwarded-for の「末尾」はエッジが追記する値であるためこれも偽装困難。
--
-- 変更:
--   1) cf-connecting-ip を最優先
--   2) x-forwarded-for は末尾を採用
--   3) x-real-ip フォールバック
--   4) 全部空なら NULL
--
-- Phase 2 (UA hash 併用) と Phase 3 (anonymous_post_enabled スイッチ) は本 migration の
-- スコープ外。本 migration の戻り値変更により、過去 24 時間集計の母集団が一時的に
-- ずれる可能性がある点のみ受け入れる (NFR-139-01)。
-- reporter_ip 既存データのクリーンアップは行わない (FR-139-04)。
-- check_post_rate_limit() は extract_request_ip() を呼び続けるため、本関数の差し替えで
-- IP 偽装耐性が自動的に有効化される。

BEGIN;

CREATE OR REPLACE FUNCTION public.extract_request_ip() RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  headers   JSONB := COALESCE(current_setting('request.headers', true)::jsonb, '{}'::jsonb);
  xff       TEXT;
  parts     TEXT[];
  candidate TEXT;
BEGIN
  -- 1) cf-connecting-ip: Cloudflare エッジが上書きするためクライアント偽装不可
  candidate := btrim(COALESCE(headers ->> 'cf-connecting-ip', ''));
  IF candidate <> '' THEN
    RETURN candidate;
  END IF;

  -- 2) x-forwarded-for は末尾を採用。エッジが追記する値が末尾にある
  xff := COALESCE(headers ->> 'x-forwarded-for', '');
  IF btrim(xff) <> '' THEN
    parts := string_to_array(xff, ',');
    candidate := btrim(parts[array_length(parts, 1)]);
    IF candidate <> '' THEN
      RETURN candidate;
    END IF;
  END IF;

  -- 3) x-real-ip フォールバック（リバースプロキシ環境によっては信頼可能）
  candidate := btrim(COALESCE(headers ->> 'x-real-ip', ''));
  IF candidate <> '' THEN
    RETURN candidate;
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.extract_request_ip() IS
  'REQ-139 Phase 1: cf-connecting-ip を最優先、x-forwarded-for は末尾採用に変更し IP 偽装耐性を強化。';

COMMIT;
