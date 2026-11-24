-- REQ-168 派生: protect_official_flag（REQ-002）に service_role バイパスを追加する。
--
-- 背景: is_official を保護するトリガー関数群のうち protect_official_flag だけが service_role を
-- 除外しておらず、service_role（信頼済みバックエンド鍵）による INSERT でも is_official が FALSE に
-- 強制されていた。兄弟関数 protect_post_status / protect_post_insert_columns は service_role を
-- 素通りさせるため、トリガー族で挙動が不整合になっていた（rls_posts.sql INV-R136-07 で顕在化）。
-- service_role は元々全権の信頼済み鍵であり、is_official を設定できて然るべきなので素通りに揃える。
-- admin / 一般ユーザーに対する挙動（admin は変更可、一般は OLD 固定 / INSERT 時 FALSE 強制）は不変。

CREATE OR REPLACE FUNCTION protect_official_flag()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'admin' THEN
      NEW.is_official := FALSE;
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.is_official IS DISTINCT FROM NEW.is_official THEN
    IF (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'admin' THEN
      NEW.is_official := OLD.is_official;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
