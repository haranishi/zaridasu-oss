-- ════════════════════════════════════════════════════════════════════════════
-- REQ-221（残作業）: 内部テーブルへの anon/authenticated 不要 GRANT の最小権限化
--
--   背景:
--     ザリダスは anon（publishable）キーで PostgREST を直接叩くクライアント直結構成で、
--     防御線は DB 側にある。Supabase はプロジェクト作成時に既定で
--       GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
--       GRANT SELECT, INSERT                ON ALL TABLES IN SCHEMA public TO anon;
--     を一括付与する（CI rls-tests の .github/workflows/ci.yml もこの既定を再現する）。
--     その結果、「フロントから一切触らない内部専用テーブル」にも anon/authenticated の
--     GRANT が残る。RLS で守られていても、不要 GRANT を剥がして「whether（そもそも触れるか）」
--     の層を絞るのは多層防御として有効（REQ-221 / runbook C-3）。
--
--   本 migration の位置づけ（なぜ migration が必要か）:
--     schema.sql にも同じ REVOKE を正本反映するが、Supabase の既定 GRANT は
--     **schema/migration 適用後（プロジェクト作成時）に効いている**ため、live DB では
--     schema.sql 内の REVOKE だけでは「以後の既定 GRANT」に上書きされて効かない。
--     migration は既定 GRANT の **後** に適用されるため、ここで明示 REVOKE して初めて
--     live DB 上で恒久的に最小権限が確定する（検証: Docker で既定 GRANT 後に本 REVOKE を
--     適用 → 対象 4 つは anon/authenticated 権限ゼロ・ユーザー向けテーブルは不変を確認）。
--
--   対象に入れる判定基準（厳格・安全側）:
--     (a) フロントが `.from('<table>')` で直接クエリしない（src/ 全体を grep で確認）。
--     (b) アクセス経路が service_role（Edge Function）/ SECURITY DEFINER 関数 / トリガーのみ。
--         → これらは RLS / テーブル GRANT を跨ぐ（service_role は BYPASSRLS、DEFINER は所有者権限）
--           ため、anon/authenticated GRANT を剥がしても壊れない。
--     (c) authenticated に**直接アクセスを許す RLS ポリシーが無い**（= 既定 GRANT が無くても
--         アプリの正規経路に影響しない）。
--
--   ここに入れず runbook（C-3）の手動点検に残した内部テーブル（安全確証が持てないもの）:
--     - audit_logs        : フロントが supabase.from('audit_logs').insert()（src/lib/auditLog.ts）。
--                           admin の authenticated INSERT/SELECT ポリシーあり。→ 触らない。
--     - ai_call_logs      : フロントが supabase.from('ai_call_logs').select()
--                           （src/hooks/useGeminiAuthBanner.ts）。admin SELECT ポリシーあり。→ 触らない。
--     - admin_alerts      : 現状フロント直アクセスは無いが admin SELECT ポリシー（authenticated）
--                           あり。将来 admin UI が直読みし得るため安全側で保留。
--     - experiments /
--       experiment_assignments
--                         : 現状フロントは RPC（get_experiment_metrics / get_my_experiment_variants）
--                           経由のみだが、admin_all_* / own_select_assignments の authenticated
--                           ポリシーが意図的に存在する。直アクセス再開の余地があるため安全側で保留。
--     - push_subscriptions: フロントが本人 RLS で直接 read/write（src/hooks）。ユーザー向け。→ 触らない。
--
--   過去 migration は改変せず、本連番（20260616000004）で追補する。すべて冪等（REVOKE は
--   何度実行しても安全。対象が未作成でも DO ブロックで握りつぶす）。
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 共通ヘルパ: 対象（テーブル/ビュー）が存在する場合のみ anon/authenticated を REVOKE。
--   - 対象が未作成（部分適用環境）でも no-op で安全。
--   - 所有者でないロールで適用された場合は insufficient_privilege を握りつぶし、runbook の
--     手動点検（C-3）に委ねる（20260616000001 と同方針）。
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_obj text;
  v_targets text[] := ARRAY[
    -- 安全根拠は本ファイル冒頭の判定基準 (a)(b)(c) を各テーブルが満たすことを個別確認済み（下記コメント）。
    'public.admin_login_attempts',  -- (a) src/ に .from() 無し（"admin_login_attempts" の唯一の出現は
                                    --     src/views/admin/AdminLoginPage.tsx の localStorage キー定数で、テーブル
                                    --     クエリではない）。(b) アクセスは admin_login_check / admin_login_record
                                    --     （SECURITY DEFINER）経由のみ。(c) RLS 有効・ポリシー 0 件（authenticated
                                    --     にも何も返さない安全側）。→ 既定 GRANT は完全に不要。
    'public.geo_cache',             -- (a) src/ に .from() 無し。(b) アクセスは Edge Function enrich-place
                                    --     （SUPABASE_SERVICE_ROLE_KEY = service_role / BYPASSRLS）のみ。
                                    --     (c) RLS 有効・ポリシー 0 件。schema.sql で既に REVOKE ALL 済みの意図を
                                    --     live DB に効かせる（既定 GRANT に上書きされないよう migration で再確定）。
    'public.lifecycle_email_log',   -- (a) src/ に参照無し。(b) 書込みは record_lifecycle_email / run_*_batch
                                    --     （SECURITY DEFINER・anon/authenticated への EXECUTE は REVOKE 済み）、
                                    --     読取りは notify-* Edge（service_role）。(c) RLS 有効・ポリシー 0 件。
    'public.user_last_active'       -- ビュー。(a) src/ に参照無し。(b) get_dormant_users 等（SECURITY DEFINER）
                                    --     / notify-dormant-reengage Edge（service_role）のみ。auth.users 参照を
                                    --     含むため anon/authenticated に直接見せない（schema.sql で REVOKE ALL 済み）。
  ];
BEGIN
  FOREACH v_obj IN ARRAY v_targets LOOP
    -- to_regclass は存在しないオブジェクトに NULL を返す（例外を投げない）。存在時のみ REVOKE。
    IF to_regclass(v_obj) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON %s FROM anon, authenticated', v_obj);
    ELSE
      RAISE NOTICE 'REQ-221: % は未作成のため REVOKE をスキップ', v_obj;
    END IF;
  END LOOP;
EXCEPTION WHEN insufficient_privilege THEN
  -- 所有者でないロールで適用された場合は no-op（runbook C-3 の手動 REVOKE に委ねる）
  RAISE NOTICE 'REQ-221: 内部テーブル REVOKE をスキップ（権限不足）。runbook C-3 を参照';
END $$;

COMMIT;
