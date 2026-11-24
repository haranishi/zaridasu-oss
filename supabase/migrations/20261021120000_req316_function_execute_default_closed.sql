-- REQ-316 の続き / security-hardening 要件1: SECURITY DEFINER 関数の EXECUTE 権限を既定で閉じる。
--
-- 背景: 関数は作った時点で PUBLIC に EXECUTE が付く。`REVOKE ... FROM anon` は anon への直接付与しか
--   剥がさないので、PUBLIC を先に剥がさないと匿名で実行できてしまう。2026-10-01 の migration
--   20260926175847 は通知用の内部 RPC 7 本と get_ai_cost_summary だけを閉じた。残りを、ここで閉じる。
-- 実測（CI と同じ手順の手元 DB, 2026-10-21）: 匿名が実行できる非トリガーの SECURITY DEFINER 関数は 35 本。
--   REQ-316 の一覧に無かった、配信を希望する利用者の宛先一覧（get_weekly_digest_recipients）、
--   購読の無効化と掃除（deactivate_push_subscription / prune_disabled_push_subscriptions）、
--   全員分の再計算（recompute_all_*）も含まれていた。
--
-- 追記のみ・冪等。本番の実状態が見えないので、関数は存在を確かめて、無ければ飛ばす。
-- 4 つに分ける:
--   内部専用        … service_role のみ（通知・保守・集計。本体の認可に頼らず、権限の層でも閉じる）
--   管理者・本人用  … authenticated + service_role（本体が管理者・本人を確かめる。匿名とPUBLICだけ外す）
--   公開が仕様      … anon + authenticated + service_role（ランキング・公開プロフィール・配信停止）
--   上記以外        … 最後に掃き出し、PUBLIC と anon を外す（authenticated は現状維持）
-- 公開が仕様の関数を誤って閉じたら、画面が壊れる。最後に確かめ、閉じていたらこの migration ごと失敗させる。
BEGIN;

DO $$
DECLARE
  internal_only text[] := ARRAY[
    'private.call_ai_edge_function(text,jsonb)',
    'public._kpi_assert_admin()',
    'public.deactivate_push_subscription(text)',
    'public.extract_request_ip()',
    'public.get_lifecycle_unsubscribe_rate(integer)',
    'public.get_municipality_weekly_digest(text)',
    'public.get_weekly_digest_recipients(integer)',
    'public.prune_disabled_push_subscriptions(integer)',
    'public.recompute_all_collections()',
    'public.recompute_all_progress()',
    'public.req_is_admin()'
  ];
  signed_in text[] := ARRAY[
    'public.adopt_post_research(uuid,boolean)',
    'public.delete_own_account()',
    'public.get_admin_post_locations(uuid[])',
    'public.get_admin_user_list()',
    'public.get_ai_accuracy_stats()',
    'public.get_audit_logs(integer,integer,text,timestamptz,timestamptz,uuid)',
    -- 引数 5 つの古い版が本番にだけ残っている疑い（REQ-316 FR-316-06）。あれば同じ扱いで閉じる。
    'public.get_audit_logs(integer,integer,text,timestamptz,timestamptz)',
    'public.get_experiment_metrics(text,timestamptz,timestamptz)',
    'public.get_kpi_quality_funnel(timestamptz,timestamptz,numeric)',
    'public.get_kpi_summary(numeric)',
    'public.get_my_post_location(uuid)',
    'public.get_retention_cohorts(integer)',
    'public.get_user_activity(uuid)',
    'public.set_post_location_disclosure(uuid,text)',
    'public.set_species_location_default(text,text)',
    'public.set_user_admin_role(uuid,boolean)'
  ];
  public_by_design text[] := ARRAY[
    'public.apply_unsubscribe(uuid,text)',
    'public.get_my_experiment_variants()',
    'public.get_user_collection(uuid)',
    'public.get_user_diversity(integer,integer)',
    'public.get_user_profile(uuid)',
    'public.get_user_progress(uuid)',
    'public.get_user_quality(integer,integer)',
    'public.get_user_ranking(integer,integer,text)',
    'public.resolve_unsubscribe_token(uuid)'
  ];
  v_sig text;
  v_fn regprocedure;
  v_keep oid[] := '{}';
  v_auth boolean;
  r record;
BEGIN
  FOREACH v_sig IN ARRAY internal_only LOOP
    v_fn := to_regprocedure(v_sig);
    IF v_fn IS NULL THEN CONTINUE; END IF;
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_fn);
  END LOOP;

  FOREACH v_sig IN ARRAY signed_in LOOP
    v_fn := to_regprocedure(v_sig);
    IF v_fn IS NULL THEN CONTINUE; END IF;
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', v_fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', v_fn);
  END LOOP;

  FOREACH v_sig IN ARRAY public_by_design LOOP
    v_fn := to_regprocedure(v_sig);
    IF v_fn IS NULL THEN CONTINUE; END IF;
    v_keep := v_keep || v_fn::oid;
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated, service_role', v_fn);
  END LOOP;

  -- 掃き出し: 上のどれにも載せていない SECURITY DEFINER 関数で、匿名が実行できるものを閉じる。
  -- 拡張が持つ関数と、自分が所有しない関数には触れない。
  FOR r IN
    SELECT p.oid AS fn_oid, p.oid::regprocedure AS fn
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE p.prosecdef
       AND p.prokind = 'f'
       AND p.prorettype <> 'trigger'::regtype
       AND n.nspname IN ('public', 'private')
       AND p.proowner = (SELECT oid FROM pg_roles WHERE rolname = current_user)
       AND NOT (p.oid = ANY (v_keep))
       AND NOT EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
       AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    RAISE NOTICE 'REQ-316 sweep: anon/PUBLIC の EXECUTE を外す: %', r.fn;
    v_auth := has_function_privilege('authenticated', r.fn_oid, 'EXECUTE');
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.fn);
    -- ログイン済みは現状維持。PUBLIC 経由で実行できていた分は、直接の付与に置き換える。
    IF v_auth THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.fn);
    END IF;
  END LOOP;

  -- 安全装置: 公開が仕様の関数が閉じていたら、migration ごと失敗させる（匿名の画面が壊れる）。
  FOREACH v_sig IN ARRAY public_by_design LOOP
    v_fn := to_regprocedure(v_sig);
    IF v_fn IS NOT NULL AND NOT has_function_privilege('anon', v_fn::oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'REQ-316: 公開が仕様の関数 % を閉じてしまった', v_fn;
    END IF;
  END LOOP;
END
$$;

-- これから作る関数は、明示の GRANT が無ければ匿名・ログイン済みから実行できない。
-- 旧い `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ... FROM PUBLIC` は動いていなかった
-- （PUBLIC への付与は組み込みの既定で、スキーマ単位の行ではないため。REQ-298 の実測）。
-- FOR ROLE postgres の全体の既定から PUBLIC を外し、Supabase が public スキーマに付ける
-- anon / authenticated の既定の付与も外す。service_role の分は残す。
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role;

COMMIT;
