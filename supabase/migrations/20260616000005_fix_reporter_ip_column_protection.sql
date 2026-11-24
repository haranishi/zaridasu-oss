-- ════════════════════════════════════════════════════════════════════════════
-- REQ-179 / REQ-208: posts.reporter_ip（PII＝投稿者IP）の列レベル保護の是正
--
--   背景（過去実装の誤り）:
--     REQ-179 / migration 20260615000001 は
--       REVOKE SELECT (reporter_ip) ON public.posts FROM anon, authenticated;
--     で reporter_ip を一般ロールから隠したつもりだったが、これは PostgreSQL では no-op。
--     Supabase はプロジェクト作成時に
--       GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;
--     をテーブルレベルで一括付与する。テーブルレベルの SELECT は全列をカバーし、
--     後続の「列単位 REVOKE」はそのテーブル付与を分解しない（列だけ剥がしたつもりでも
--     テーブル付与が残り、reporter_ip は依然 SELECT 可能）。
--     実際 information_schema.column_privileges には SELECT(reporter_ip) が残ったままで、
--     anon/authenticated の `SELECT reporter_ip FROM posts` も成功してしまう（= PII 露出が継続）。
--     → 本番 DB でも reporter_ip は読めてしまっている。本 migration で恒久是正する。
--
--   正しい保護:
--     1) reporter_ip を覆っているテーブルレベル SELECT を anon/authenticated から剥がす。
--     2) reporter_ip を「除く」全列に列単位で SELECT を付与し直す。
--        → reporter_ip を含むクエリは permission denied、含まない通常の投稿取得は従来どおり成功。
--        → 列の増減に追随するよう、対象列は information_schema から動的に列挙する。
--     アプリ本体は from('posts') で reporter_ip を選択していないため機能回帰は無い
--     （src/ を grep 済み。一覧/詳細は select 明示で reporter_ip を含まない）。
--     管理者が IP を見る必要が生じた場合は service_role / SECURITY DEFINER RPC で取得する。
--
--   なぜ schema.sql の修正だけでなく migration が必要か:
--     Supabase の既定 GRANT は schema/migration 適用「後」（プロジェクト作成時）に効くため、
--     schema.sql 内の REVOKE/GRANT だけでは既定 GRANT に上書きされて live DB では効かない。
--     migration は既定 GRANT の「後」に走るため、ここで再確定して初めて本番で保護が確定する
--     （20260616000004 grant_hardening と同じ理由・同じ手法）。
--
--   冪等: 何度実行しても安全（REVOKE→列 GRANT を都度貼り直す）。posts 未作成環境では no-op。
--   所有者でないロールで適用された場合は insufficient_privilege を握りつぶす（部分適用環境向け）。
--
--   過去 migration（20260615000001）は改変せず、本連番（20260616000005）で是正する。
--   schema.sql 側（8-5b ブロック）とも同一手法で整合させている。
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $reporter_ip_protect$
DECLARE
  v_cols text;
BEGIN
  IF to_regclass('public.posts') IS NULL THEN
    RAISE NOTICE 'REQ-179: public.posts 未作成のため reporter_ip 列保護をスキップ';
    RETURN;
  END IF;

  -- 1) reporter_ip を覆っているテーブルレベル SELECT を剥がす
  EXECUTE 'REVOKE SELECT ON public.posts FROM anon, authenticated';

  -- 2) reporter_ip 以外の全列に列単位 SELECT を付与し直す（列の増減に自動追随）
  SELECT string_agg(format('%I', column_name), ', ' ORDER BY ordinal_position)
    INTO v_cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'posts'
    AND column_name <> 'reporter_ip';

  IF v_cols IS NOT NULL THEN
    EXECUTE format('GRANT SELECT (%s) ON public.posts TO anon, authenticated', v_cols);
  END IF;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'REQ-179: reporter_ip 列保護をスキップ（権限不足）。runbook の手動 REVOKE/GRANT に委ねる';
END
$reporter_ip_protect$;

COMMIT;
