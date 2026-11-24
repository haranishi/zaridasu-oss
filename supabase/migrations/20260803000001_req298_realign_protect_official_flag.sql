-- REQ-298 FR-298-03 派生: protect_official_flag を schema.sql（REQ-208 版）へ本番も追随させる。
--
-- 背景（なぜ「今さら」この migration が要るのか）:
--   REQ-208 は protect_official_flag の JWT 無し挙動を兄弟関数 protect_post_status とそろえる修正
--   （NULLIF + EXCEPTION ハンドリングで「JWT 無し / 空 claims / パース失敗」を素通りさせる）を入れた。
--   ところがこの修正は、**既に本番へ適用済みだった 20260513000014 のファイルを直接書き換える**形で
--   行われた。version が同じなので `supabase db push` は二度と流さず、本番の関数定義は REQ-208 前の
--   まま据え置かれた。schema.sql は新版に更新されていたため、
--
--     CI（schema.sql を適用）= 新挙動  /  本番 = 旧挙動
--
--   という乖離が生まれ、どのゲートも検知しなかった。REQ-298 の「問題B (c): 適用済み migration を後から
--   書き換えると永久に検知不能」が、まさにこのリポジトリで実現していた事例である。
--
--   2026-08-03 に本番の pg_get_functiondef() を実測して確認した:
--     本番は DECLARE / NULLIF / EXCEPTION を持たない旧定義だった。
--
-- 本 migration の役割:
--   1. 本番の protect_official_flag を schema.sql と同一の REQ-208 版へ揃える（実害の解消）
--   2. 20260513000014 は「実際に適用された内容」へ巻き戻した（履歴を事実に戻す）。以後
--      scripts/check-migration-drift.sh の内容ドリフト検知が 59/59 一致で回る
--
-- 以後の規律（REQ-298 が機械化する運用ルール）:
--   **適用済みの migration ファイルは編集しない。変更は必ず新しい migration で出す。**
--   ファイルを書き換えると、この事故がそのまま再発する。
--
-- 冪等: CREATE OR REPLACE FUNCTION のみ。何度流しても同じ最終状態になる。
-- 権限: 関数の EXECUTE 権限はこの migration では変更しない（トリガー専用関数のため）。

-- REQ-002: is_official の更新を管理者のみに制限
CREATE OR REPLACE FUNCTION protect_official_flag()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  jwt_claims jsonb;
BEGIN
  -- REQ-208: 兄弟関数 protect_post_status と JWT 無し挙動をそろえる。
  -- claims のパース失敗（不正な JSON 等）は素通り。JWT 無し / 空 claims も素通りとし、
  -- service_role 判定はその後に行う。これにより「JWT 無しセッション」での分岐が
  -- protect_post_status と一致し、トリガー族の挙動統一（REQ-168 の目的）を完遂する。
  BEGIN
    jwt_claims := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb;
  EXCEPTION WHEN OTHERS THEN
    RETURN NEW;
  END;

  -- JWT 無し または service_role は素通り（Edge Function の自動承認・hash 書込み等）
  IF jwt_claims IS NULL OR jwt_claims = '{}'::jsonb THEN
    RETURN NEW;
  END IF;
  -- REQ-168: service_role（信頼済みバックエンド鍵）は他の保護トリガー
  -- (protect_post_status / protect_post_insert_columns) と同様に素通りさせる。
  -- これが無いと service_role でも is_official が FALSE 強制され、トリガー族で挙動が不整合になる。
  IF (jwt_claims ->> 'role') = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF (jwt_claims -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'admin' THEN
      NEW.is_official := FALSE;
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.is_official IS DISTINCT FROM NEW.is_official THEN
    IF (jwt_claims -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'admin' THEN
      NEW.is_official := OLD.is_official;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
