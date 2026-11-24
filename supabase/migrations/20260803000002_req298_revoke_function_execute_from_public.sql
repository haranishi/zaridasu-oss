-- REQ-298 FR-298-06: SECURITY DEFINER 関数の EXECUTE を PUBLIC からも剥がす。
--
-- 背景（2026-08-03 に本番実測で判明）:
--   schema.sql 冒頭の
--     ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
--   は **no-op** である。PostgreSQL 16 で単独実行しても pg_default_acl に行が作られず、
--   直後に作った関数の proacl は NULL（＝PUBLIC が EXECUTE を持つ既定）のままだった。
--
--   その結果 `REVOKE EXECUTE ON FUNCTION f FROM anon` だけでは anon を閉じられない。
--   REVOKE が剥がすのは anon への**直接付与**のみで、PUBLIC が EXECUTE を持ち続けるため
--   anon は PUBLIC 経由で実行できてしまう（has_function_privilege も true を返す）。
--
--   本番では migration 20260616000001 の一度きりの
--     REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC
--   により**それ以前に作られた**関数は閉じている。しかしこの一括 REVOKE は将来の関数には
--   効かないため、**それ以降に作られた関数は開いたまま**になる。
--
--   2026-08-03 の本番 pg_proc.proacl 実測:
--     detect_ai_anomalies            → {=X/postgres,...}  ❌ PUBLIC が EXECUTE 保持（anon 実行可）
--     get_dormant_users              → {postgres=X/...}   ✅ 閉じている（20260616000001 より前に作成）
--     record_lifecycle_email         → {postgres=X/...}   ✅ 同上
--     get_push_subscriptions_for_user→ {postgres=X/...}   ✅ 同上
--
--   detect_ai_anomalies は 20260616000003 で作られており、一括 REVOKE の後だったため漏れた。
--   関数本体の先頭に _kpi_assert_admin() ゲートがあるため即座のデータ漏洩には至らないが、
--   REQ-241 が想定した「GRANT 層でも閉じる」二重防御の片方が効いていない状態である。
--
-- 本 migration の役割:
--   FR-298-06 が対象とする 4 関数について、PUBLIC からの EXECUTE を明示的に剥がして
--   schema.sql と本番を一致させる。既に閉じている 3 本にとっては no-op（冪等）。
--
-- ⚠️ ここで扱うのは FR-298-06 の対象 4 本のみである。
--   2026-08-03 の実測では、本番で anon から**直接呼べる** SECURITY DEFINER 関数が 43 本ある
--   （トリガ関数を除く）。call_lifecycle_edge_function / call_send_push のように
--   Vault の service_role キーを使って任意の Edge Function を起動できるものも含まれる。
--   これは REQ-298 の範囲を超える是正であり、正当に anon から呼ばれる RPC の洗い出しが
--   前提になるため、別要件として起票して扱う。本 migration で一括 REVOKE はしない
--   （無条件に閉じるとブラウザから呼ばれている公開 RPC が壊れる）。
--
-- 冪等: REVOKE のみ。何度流しても同じ最終状態になる。

REVOKE EXECUTE ON FUNCTION public.get_dormant_users(integer, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_lifecycle_email(text, uuid, uuid, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_push_subscriptions_for_user(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.detect_ai_anomalies(integer, integer, numeric, integer, integer) FROM PUBLIC;

-- detect_ai_anomalies は authenticated からの実行を意図して残している（REQ-241: 本体先頭の
-- _kpi_assert_admin() が admin 判定を行う設計）。PUBLIC を剥がすと authenticated への
-- 明示 GRANT だけが残るので、その GRANT をここで再確定しておく（schema.sql:3658 と同一）。
GRANT EXECUTE ON FUNCTION public.detect_ai_anomalies(integer, integer, numeric, integer, integer) TO authenticated;
