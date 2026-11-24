-- REQ-292: anon GRANT された RPC の認可欠陥修復
--   （管理者ログイン制限の自己解除 / 監査ログ偽造 / メール存在確認オラクル）
--
-- 対象は「anon に EXECUTE が GRANT されている SECURITY DEFINER 関数」3 本である。
--   public.admin_login_record(text, boolean)  … 問題A / B / C
--   public.admin_login_check(text)            … 問題B の補助（任意メールのロック状態を問い合わせ可）
--   public.check_email_exists(text)           … 問題D
-- 共通の根本原因は「関数内に認可チェックが無く、呼び出し側の申告を信じる」ことである。
--
-- ───────────────────────────────────────────────────────────────────────────
-- 修復前に何が起きていたか（監査結果の要約。詳細は docs/requirements/REQ-292-*.md）
-- ───────────────────────────────────────────────────────────────────────────
-- 問題A: `p_success` は呼び出し側の申告以外に根拠が無く、SECURITY DEFINER が RLS をバイパスするため、
--        公開 anon キーで `{"p_email":"<管理者>","p_success":true}` を 1 回投げるだけで
--        admin_login_attempts の該当行が DELETE され attempt_count が 0 に戻った。
--        「15 分以内 5 回失敗で 15 分ロック」は失敗 4 回ごとにこの 1 リクエストを挟むだけで無制限に回避できた。
-- 問題B: カウンタが増えるのは admin_login_record(..., false) が呼ばれたときだけで、呼んでいるのは
--        フロントエンド（AdminLoginPage）のみだった。攻撃者は `/auth/v1/token?grant_type=password` を
--        直接叩けばよく、その経路では記録関数が呼ばれない＝**サーバー側ロックが一度も発火しなかった**。
--        20260513000013 冒頭の「クライアントストレージのリセットでは迂回できない」という設計主張は
--        成立しておらず、保存場所が sessionStorage から Postgres に移っただけであった（REQ-149 未達）。
-- 問題C: audit_logs の INSERT は admin 限定ポリシーだが SECURITY DEFINER がそれをバイパスするため、
--        anon が任意 email_hash / 任意 attempt_count の `login_failed` 行と admin_id=NULL の
--        `login_success` 行を無制限に注入できた。audit_logs は append-only（UPDATE/DELETE ポリシー
--        不在・REQ-020 / REQ-134）なので、注入行は**管理者にも消せない**＝監査証跡の恒久汚染
--        ＋ストレージ DoS になっていた。
-- 問題D: check_email_exists は auth.users を直接引くが関数内に認可・レート制限・CAPTCHA 検証が無い。
--        REQ-241 は残余リスクを「Turnstile（REQ-212）＋ Auth レート制限」で受容したが、
--        **その 2 つはいずれも RPC 直叩き経路に掛からない**（下記「REQ-241 の受容根拠の訂正」参照）。
--
-- ───────────────────────────────────────────────────────────────────────────
-- 方針（FR-292-01 の判断: (a) と (b) のハイブリッドを採用）
-- ───────────────────────────────────────────────────────────────────────────
-- (b) 相当（**このファイルの適用だけで即座に有効**・追加設定不要）:
--   1. anon / authenticated から EXECUTE を剥がす（FR-292-02）。
--   2. 各関数の本体先頭に fail-closed な認可ゲートを置く（GRANT が将来復活しても閉じたままにする）。
--   3. `login_success` の記録は「auth.uid() が実在し、その uid のメールが p_email と一致する」ときのみ
--      行う（FR-292-03）。admin_id=NULL の login_success 行は構造的に作れなくなる。
--      ＝フロント（AdminLoginPage）は signInWithPassword 成功**後**に authenticated として呼ぶ形になり、
--      「他人のメールを申告してカウンタを消す」ことが原理的に不可能になる。
--   4. 失敗記録（`p_success=false`）は service_role / 直 DB 接続（＝サーバー側イベント）専用にする。
--      これで問題C（anon による audit_logs 注入）が閉じる。
-- (a) 相当（**Supabase 側で Auth Hook を有効化して初めて効く**）:
--   5. Password Verification Attempt Hook 用の関数 public.admin_login_password_attempt(jsonb) を新設し、
--      `/auth/v1/token` 直叩きも含む**すべての**パスワード認証試行をサーバー側で記録できるようにする
--      （問題B の記録側を解消）。有効化手順は下記「本番適用手順」を参照。
--
-- ⚠ ブルートフォース対策の所在（FR-292-01(b) が要求する「代替対策の併記」）:
--   本 migration は Auth Hook 経路でも **`decision: reject` を返さない**（記録と可視化のみ行う）。
--   理由: Password Verification Attempt Hook のペイロードは `{user_id, valid}` のみで **リクエスト IP を
--   含まない**（PostgREST の request.headers GUC も無いため extract_request_ip() は '' になる）。
--   したがってカウンタは実質「メール単位・全 IP 共通」になり、reject を有効にすると
--   **未認証の第三者が管理者のメールで 5 回失敗させるだけで正規管理者をロックアウトできる**
--   （管理者 DoS）。ロックアウト DoS は本要件が防ごうとしている攻撃より運用被害が大きいため採らない。
--   総当たりの上限は Supabase Auth 自身の `/auth/v1/token` レート制限に委ね、本 migration は
--   「試行が**偽造不能な形で**監査ログに残り検知できる」状態を作ることを担保範囲とする。
--   より強い強制が必要になった場合の選択肢（別 REQ 化を推奨）:
--     - Supabase Dashboard > Authentication > Rate Limits の `token` 上限を引き下げる（IP 単位で効く）
--     - Cloudflare 側（WAF / Rate limiting rules）で `/auth/v1/token` に IP レート制限を掛ける
--     - ログインを Edge Function 経由に変え、IP を含む文脈でロック判定する（フロント改修が必要）
--
-- 冪等性: CREATE OR REPLACE / REVOKE / DO ブロックのみを使い、何度適用しても同じ最終状態になる。
-- 既存 migration（20260513000013 / 20260703000003）は書き換えず、本ファイルで上書き定義する（FR-292-06）。

BEGIN;

----------------------------------------------------------------------
-- 0. 共通ヘルパ: 「サーバー側の信頼できる呼び出し元か」の判定
----------------------------------------------------------------------
-- ⚠ current_user / CURRENT_ROLE は使えない: SECURITY DEFINER 関数の内部では所有者（postgres）に
--   すり替わるため、呼び出し元の判定には使用できない（誰から呼ばれても postgres に見える）。
--
-- 独立した 2 段のガードを併用する（どちらか一方が破れても閉じたままにする）:
--   (1) role GUC: PostgREST はリクエストごとに `SET LOCAL ROLE anon|authenticated|service_role` を発行する。
--       role GUC は SECURITY DEFINER でも書き換わらない（current_user だけが所有者へすり替わる。
--       postgres 16 で実測確認済み: SET LOCAL ROLE anon → 関数内で role_guc=anon / current_user=postgres）。
--       直 DB 接続（GoTrue / pg_cron / psql）では既定値 'none' のままになる。
--   (2) request.jwt.claims: PostgREST は JWT のクレームを必ずセットする（anon キーでも {"role":"anon"}）。
--       直 DB 接続では未設定＝NULL になる。
CREATE OR REPLACE FUNCTION public._req292_is_server_caller()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_claims jsonb;
  v_role   text := current_setting('role', true);
BEGIN
  -- (1) PostgREST が切り替えるクライアントロールなら即座に拒否する。
  IF v_role IN ('anon', 'authenticated') THEN
    RETURN false;
  END IF;
  -- (2) claims 由来の判定。
  v_claims := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb;
  IF v_claims IS NULL THEN
    -- PostgREST 経由ではない（Auth Hook / cron / psql / service_role 直接接続）。
    RETURN true;
  END IF;
  RETURN (v_claims ->> 'role') = 'service_role';
EXCEPTION WHEN others THEN
  -- claims が壊れた JSON 等でパースできない場合は「信頼しない」（fail-closed）。
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public._req292_is_server_caller() FROM PUBLIC;
REVOKE ALL ON FUNCTION public._req292_is_server_caller() FROM anon, authenticated;

COMMENT ON FUNCTION public._req292_is_server_caller() IS
  'REQ-292: 呼び出し元がサーバー側（Auth Hook / cron / service_role / 直 DB 接続）かを返す内部ヘルパ。PostgREST 経由の anon / authenticated は false。claims 破損時は false（fail-closed）。';

----------------------------------------------------------------------
-- 1. admin_login_check: anon / authenticated から剥奪 + 本体ゲート（FR-292-02）
----------------------------------------------------------------------
-- 副作用は無いが「任意のメールに対してロック状態を問い合わせられる」＝管理者メールの当て推量に
-- 使えるため、フロントからの呼び出しを廃止して anon / authenticated ともに剥がす。
-- 本体にもゲートを置き、既定 GRANT が復活しても情報を返さないようにする（多層防御）。
CREATE OR REPLACE FUNCTION public.admin_login_check(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ip   text := coalesce(public.extract_request_ip(), '');
  v_hash text := md5(lower(coalesce(p_email, '')));
  v_lock timestamptz;
BEGIN
  -- REQ-292 FR-292-02: サーバー側呼び出し元のみ。anon / authenticated は 42501。
  IF NOT public._req292_is_server_caller() THEN
    RAISE EXCEPTION 'REQ-292: admin_login_check is server-side only'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT locked_until INTO v_lock
  FROM admin_login_attempts
  WHERE email_hash = v_hash AND ip = v_ip;

  IF v_lock IS NOT NULL AND v_lock > now() THEN
    RETURN jsonb_build_object('locked', true,
      'retry_after_seconds', ceil(extract(epoch FROM (v_lock - now())))::int);
  END IF;
  RETURN jsonb_build_object('locked', false, 'retry_after_seconds', 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_login_check(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_login_check(text) FROM anon, authenticated;

COMMENT ON FUNCTION public.admin_login_check(text) IS
  'REQ-149 / REQ-292: 管理者ログインのロック状態読み取り。REQ-292 で anon/authenticated の EXECUTE を剥奪し、本体もサーバー側呼び出し元限定にした（任意メールのロック状態問い合わせ＝メール当て推量を封じる）。フロントからは呼ばない。';

----------------------------------------------------------------------
-- 2. admin_login_record: 認可ゲート + login_success の本人限定化（FR-292-01 / 03）
----------------------------------------------------------------------
-- p_success = true  … 「自分のログイン成功」の自己申告。auth.uid() が実在し、その uid のメールが
--                     p_email と一致するときのみ実行する。したがって
--                       * anon（auth.uid() = NULL）は到達できない → 問題A が閉じる
--                       * 他人のメールを申告してカウンタを消すことができない
--                       * admin_id = NULL の login_success 行が作れない → 問題C の後半が閉じる
--                     フロント（AdminLoginPage）は signInWithPassword 成功後に authenticated として呼ぶ。
-- p_success = false … サーバー側イベントのみ（service_role / Auth Hook / 直 DB 接続）。
--                     anon / authenticated からは 42501 → 任意 email_hash・任意 attempt_count の
--                     login_failed 注入が不可能になる → 問題C の前半が閉じる。
CREATE OR REPLACE FUNCTION public.admin_login_record(p_email text, p_success boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ip      text := coalesce(public.extract_request_ip(), '');
  v_hash    text;
  v_headers jsonb := coalesce(current_setting('request.headers', true)::jsonb, '{}'::jsonb);
  v_ua      text := v_headers ->> 'user-agent';
  v_uid     uuid := auth.uid();
  v_email   text := lower(btrim(coalesce(p_email, '')));
  v_self    text;
  v_count   int := 0;
  v_locked  timestamptz;
  c_max     constant int := 5;
  c_window  constant interval := interval '15 minutes';
  c_lock    constant interval := interval '15 minutes';
  c_dedup   constant interval := interval '60 seconds';
BEGIN
  IF v_email = '' THEN
    RAISE EXCEPTION 'REQ-292: p_email is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  v_hash := md5(v_email);

  ------------------------------------------------------------------
  -- 成功記録: 本人（auth.uid()）による自己申告のみ（FR-292-03）
  ------------------------------------------------------------------
  IF p_success THEN
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'REQ-292: login_success requires an authenticated session'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT lower(u.email) INTO v_self FROM auth.users u WHERE u.id = v_uid;
    IF v_self IS NULL OR v_self <> v_email THEN
      -- 「他人のメール」を申告した場合。カウンタ削除にも監査記録にも到達させない。
      RAISE EXCEPTION 'REQ-292: p_email does not match the authenticated user'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- 本人性が確認できたので当該メールの失敗カウンタを解除する。
    -- ip 条件は付けない: Auth Hook 経路で記録された行は ip='' になるため、ip 一致で消すと残ってしまう。
    -- 「正しい資格情報を提示できた本人」がスロットルを解除する挙動は一般的で、かつ本人限定なので悪用不可。
    DELETE FROM admin_login_attempts WHERE email_hash = v_hash;

    -- 監査記録（パスワードは記録しない）。Auth Hook が同じ成功を記録済みなら二重に積まない。
    IF NOT EXISTS (
      SELECT 1 FROM audit_logs
      WHERE action = 'login_success' AND admin_id = v_uid AND created_at > now() - c_dedup
    ) THEN
      INSERT INTO audit_logs (admin_id, action, target_type, target_id, details)
      VALUES (v_uid, 'login_success', 'user', v_uid,
              jsonb_build_object('ip', v_ip, 'user_agent', v_ua, 'source', 'client_rpc'));
    END IF;
    RETURN jsonb_build_object('locked', false);
  END IF;

  ------------------------------------------------------------------
  -- 失敗記録: サーバー側イベント専用（問題C を閉じる）
  ------------------------------------------------------------------
  IF NOT public._req292_is_server_caller() THEN
    RAISE EXCEPTION 'REQ-292: login_failed can only be recorded server-side'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ウィンドウ内ならカウント加算、ウィンドウ超過ならリセット
  INSERT INTO admin_login_attempts (email_hash, ip, attempt_count, window_started_at, updated_at)
  VALUES (v_hash, v_ip, 1, now(), now())
  ON CONFLICT (email_hash, ip) DO UPDATE SET
    attempt_count = CASE WHEN admin_login_attempts.window_started_at < now() - c_window
                         THEN 1 ELSE admin_login_attempts.attempt_count + 1 END,
    window_started_at = CASE WHEN admin_login_attempts.window_started_at < now() - c_window
                             THEN now() ELSE admin_login_attempts.window_started_at END,
    updated_at = now()
  RETURNING attempt_count INTO v_count;

  IF v_count >= c_max THEN
    v_locked := now() + c_lock;
    UPDATE admin_login_attempts SET locked_until = v_locked
    WHERE email_hash = v_hash AND ip = v_ip;
  END IF;

  INSERT INTO audit_logs (admin_id, action, target_type, target_id, details)
  VALUES (NULL, 'login_failed', 'user', NULL,
          jsonb_build_object('ip', v_ip, 'email_hash', v_hash,
                             'attempt_count', v_count, 'reason', 'invalid_credentials',
                             'source', 'server_rpc'));

  RETURN jsonb_build_object(
    'locked', v_count >= c_max,
    'retry_after_seconds', CASE WHEN v_locked IS NOT NULL
                                THEN ceil(extract(epoch FROM (v_locked - now())))::int ELSE 0 END,
    'attempt_count', v_count
  );
END;
$$;

-- FR-292-02: anon の EXECUTE を剥奪。authenticated は「本人の login_success 自己申告」のために残す
--   （p_email が auth.uid() のメールと一致しないと本体が 42501 を返すため、他人の行は作れない）。
REVOKE EXECUTE ON FUNCTION public.admin_login_record(text, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_login_record(text, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_login_record(text, boolean) TO authenticated;

COMMENT ON FUNCTION public.admin_login_record(text, boolean) IS
  'REQ-149 / REQ-292: ログイン試行の記録。REQ-292 で anon EXECUTE を剥奪し、p_success=true は auth.uid() とメール一致が必須（admin_id NULL の login_success を作れない）、p_success=false は service_role / Auth Hook 等のサーバー側呼び出し元専用にした。';

----------------------------------------------------------------------
-- 3. Password Verification Attempt Hook（FR-292-01(a)・問題B の記録側）
----------------------------------------------------------------------
-- Supabase Auth（GoTrue）が **パスワード検証の直後に** 呼ぶフック。`/auth/v1/token` 直叩きでも
-- 必ず通るため、「フロントが自発的に申告したときだけ記録される」という問題B の本質が解消する。
--
-- ペイロード: {"user_id": "<uuid>", "valid": true|false}
--   ※ email も IP も含まれない。email は auth.users から引き、IP は取得できない（'' になる）。
-- 戻り値: {"decision": "continue"} を常に返す（reject は返さない。理由は冒頭の ⚠ を参照）。
--
-- ⚠ fail-open 設計（最重要）: このフックが例外を投げると GoTrue はパスワードログイン全体を
--   失敗させる＝**全ユーザーがログインできなくなる**。したがって本体全体を EXCEPTION WHEN others で
--   包み、いかなる内部エラーでも 'continue' を返す。監査記録の欠落よりログイン継続を優先する。
CREATE OR REPLACE FUNCTION public.admin_login_password_attempt(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid    uuid;
  v_valid  boolean;
  v_email  text;
  v_hash   text;
  v_ip     text := coalesce(public.extract_request_ip(), '');
  v_count  int := 0;
  c_max    constant int := 5;
  c_window constant interval := interval '15 minutes';
  c_lock   constant interval := interval '15 minutes';
  c_dedup  constant interval := interval '60 seconds';
  c_ok     constant jsonb := jsonb_build_object('decision', 'continue');
BEGIN
  -- GoTrue は直 DB 接続（supabase_auth_admin）で呼ぶため request.jwt.claims は存在しない。
  -- PostgREST 経由（anon / authenticated）で呼ばれた場合は**副作用を起こさず**素通りさせる。
  -- ここが無いと、将来 Supabase 既定の一括 GRANT EXECUTE が復活した際に、
  -- anon が {"user_id":"<管理者>","valid":true} を投げてカウンタを消せる＝問題A の再来になる。
  IF NOT public._req292_is_server_caller() THEN
    RETURN c_ok;
  END IF;

  v_uid   := NULLIF(event #>> '{user_id}', '')::uuid;
  v_valid := coalesce((event #>> '{valid}')::boolean, false);
  IF v_uid IS NULL THEN
    RETURN c_ok;
  END IF;

  SELECT lower(u.email) INTO v_email FROM auth.users u WHERE u.id = v_uid;
  IF v_email IS NULL OR v_email = '' THEN
    RETURN c_ok;
  END IF;
  v_hash := md5(v_email);

  IF v_valid THEN
    DELETE FROM admin_login_attempts WHERE email_hash = v_hash;
    -- クライアント側の admin_login_record(p_success=true) が同じ成功を記録済みなら二重に積まない。
    IF NOT EXISTS (
      SELECT 1 FROM audit_logs
      WHERE action = 'login_success' AND admin_id = v_uid AND created_at > now() - c_dedup
    ) THEN
      INSERT INTO audit_logs (admin_id, action, target_type, target_id, details)
      VALUES (v_uid, 'login_success', 'user', v_uid,
              jsonb_build_object('ip', v_ip, 'source', 'auth_hook'));
    END IF;
    RETURN c_ok;
  END IF;

  INSERT INTO admin_login_attempts (email_hash, ip, attempt_count, window_started_at, updated_at)
  VALUES (v_hash, v_ip, 1, now(), now())
  ON CONFLICT (email_hash, ip) DO UPDATE SET
    attempt_count = CASE WHEN admin_login_attempts.window_started_at < now() - c_window
                         THEN 1 ELSE admin_login_attempts.attempt_count + 1 END,
    window_started_at = CASE WHEN admin_login_attempts.window_started_at < now() - c_window
                             THEN now() ELSE admin_login_attempts.window_started_at END,
    updated_at = now()
  RETURNING attempt_count INTO v_count;

  IF v_count >= c_max THEN
    UPDATE admin_login_attempts SET locked_until = now() + c_lock
    WHERE email_hash = v_hash AND ip = v_ip;
  END IF;

  -- email_hash はサーバー側で auth.users から導出しているため偽造できない（問題C との差）。
  INSERT INTO audit_logs (admin_id, action, target_type, target_id, details)
  VALUES (NULL, 'login_failed', 'user', NULL,
          jsonb_build_object('ip', v_ip, 'email_hash', v_hash,
                             'attempt_count', v_count, 'reason', 'invalid_credentials',
                             'source', 'auth_hook'));

  RETURN c_ok;
EXCEPTION WHEN others THEN
  -- fail-open: 監査記録に失敗してもログインは止めない。
  RETURN c_ok;
END;
$$;

-- Auth Hook は supabase_auth_admin から呼ばれる。それ以外（PUBLIC / anon / authenticated）は剥奪。
REVOKE ALL ON FUNCTION public.admin_login_password_attempt(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_login_password_attempt(jsonb) FROM anon, authenticated;

-- supabase_auth_admin はローカル CI の擬似環境には存在しないため、存在確認してから GRANT する（冪等）。
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA public TO supabase_auth_admin';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.admin_login_password_attempt(jsonb) TO supabase_auth_admin';
  END IF;
END $$;

COMMENT ON FUNCTION public.admin_login_password_attempt(jsonb) IS
  'REQ-292 FR-292-01(a): Supabase Password Verification Attempt Hook。/auth/v1/token 直叩きも含む全パスワード認証試行を admin_login_attempts と audit_logs に記録する。常に decision=continue（reject は返さない: ペイロードに IP が無くメール単位ロックになるため管理者ロックアウト DoS を招く）。例外は握り潰して fail-open（フックのエラーは全ユーザーのログイン障害になる）。';

----------------------------------------------------------------------
-- 4. check_email_exists: メール存在確認オラクルを閉じる（FR-292-05(a)）
----------------------------------------------------------------------
-- ★ REQ-241 の受容根拠の訂正（FR-292-05 が明記を要求している事実）:
--   20260703000003_req241_authz_enumeration_hardening.sql:162 は
--     「列挙リスクの残余は Turnstile（REQ-212）＋ Auth レート制限で受容（runbook に根拠）」
--   と記録したが、**この 2 つはいずれも POST /rest/v1/rpc/check_email_exists の直叩きには掛からない**。
--     - Turnstile: ブラウザ上のウィジェットで、token は supabase.auth.signUp() に渡される。
--       RPC 呼び出しには一切介在しない。site key 未設定なら captchaEnabled=false で完全 no-op でもある。
--     - Auth レート制限: `/auth/v1/*` に対する制限であり PostgREST の `/rest/v1/rpc/*` には適用されない。
--   したがって「公開 anon キーだけで任意の辞書を回して登録ユーザーの在・不在を確認できるオラクル」が
--   公開状態にあった。本番は実在市民のメールアドレスを扱うため、外部で入手したメールリストとの突合による
--   名寄せ（誰がこのサービスに登録しているかの特定）に直結する。
--   「同じ情報が signUp 経路でも漏れる」ことは「制限の無い経路を残してよい」理由にならない
--   （signUp には Auth レート制限と Turnstile が実際に掛かる）。
--   → 対処: フロントの事前チェックを廃止し、重複判定は signUp 後の identities 空判定
--     （Supabase Auth の統一エラー）に一本化する。本関数からは anon / authenticated を剥奪する。
--   → docs/runbooks/supabase-hardening-checklist.md にも同じ訂正を記録し、同じ根拠
--     （「Turnstile ＋ Auth レート制限で受容」）で他の判断をしていないかを点検すること。
--
-- 関数自体は DROP せず残す（database.types.ts / 将来の service_role 用途との整合を壊さないため）。
-- ただし本体にゲートを置き、PostgREST 経由では常に 42501 になる。
CREATE OR REPLACE FUNCTION public.check_email_exists(lookup_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- REQ-292 FR-292-05: メール存在確認オラクルを閉じる。サーバー側呼び出し元のみ。
  IF NOT public._req292_is_server_caller() THEN
    RAISE EXCEPTION 'REQ-292: check_email_exists is server-side only'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM auth.users WHERE lower(email) = lower(btrim(coalesce(lookup_email, '')))
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_email_exists(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_email_exists(TEXT) FROM anon, authenticated;

COMMENT ON FUNCTION public.check_email_exists(TEXT) IS
  'REQ-241 / REQ-292: 非推奨。REQ-292 で anon/authenticated の EXECUTE を剥奪し本体もサーバー側限定にした（メール存在確認オラクルの閉塞）。REQ-241 が受容根拠にした Turnstile ＋ Auth レート制限は RPC 直叩き経路に掛からず、根拠として誤りだった。サインアップの重複判定は signUp 後の identities 空判定に一本化した。';

----------------------------------------------------------------------
-- 5. FR-292-04: 既存の汚染行の扱い（判断: (a) 残す＋調査手順を記録）
----------------------------------------------------------------------
-- audit_logs は append-only（UPDATE / DELETE ポリシー不在・REQ-020 / REQ-134）であり、
-- 「消せないこと」自体が改竄防止の設計意図である。本 migration では **DELETE を行わない**。
-- 本番で汚染の有無を確認する読み取り専用クエリ（service_role / SQL Editor で実行）:
--
--   -- (1) anon 注入の疑いがある login_failed（source 未記録＝REQ-292 以前の行）
--   SELECT date_trunc('day', created_at) AS d, count(*),
--          max((details ->> 'attempt_count')::int) AS max_attempt,
--          count(DISTINCT details ->> 'email_hash') AS distinct_email_hash,
--          count(DISTINCT details ->> 'ip')         AS distinct_ip
--     FROM audit_logs
--    WHERE action = 'login_failed' AND details ->> 'source' IS NULL
--    GROUP BY 1 ORDER BY 1 DESC;
--
--   -- (2) admin_id が NULL の login_success（本来あり得ない＝問題C の痕跡）
--   SELECT id, created_at, details FROM audit_logs
--    WHERE action = 'login_success' AND admin_id IS NULL ORDER BY created_at DESC;
--
--   -- (3) 想定外 IP / 異常な attempt_count
--   SELECT details ->> 'ip' AS ip, count(*), max((details ->> 'attempt_count')::int)
--     FROM audit_logs WHERE action IN ('login_failed','login_success')
--    GROUP BY 1 ORDER BY 2 DESC LIMIT 50;
--
-- 判断: (2) が 0 件かつ (1)(3) に異常が無ければ汚染は確認できない＝FR-292-04(a) で足りる。
-- 汚染が確認された場合のみ、理由（append-only の設計意図を破ること・対象行の特定条件・件数）を
-- コメントに明記した **一度限りの整理 migration** を別途起票する（本 migration では行わない）。
-- REQ-292 以降の行は details.source（'client_rpc' / 'auth_hook' / 'server_rpc'）で由来が判別できる。

COMMIT;

----------------------------------------------------------------------
-- 本番適用手順（migration 適用のほかに必要な操作）
----------------------------------------------------------------------
-- (I) 必須ではないが推奨: Password Verification Attempt Hook の有効化（FR-292-01(a) / AC-03）
--     Supabase Dashboard > Authentication > Hooks（Beta）>
--       "Password Verification Attempt" に `public.admin_login_password_attempt` を指定して Enable。
--     CLI 管理する場合は supabase/config.toml に以下を追加する:
--       [auth.hook.password_verification_attempt]
--       enabled = true
--       uri = "pg-functions://postgres/public/admin_login_password_attempt"
--     有効化後の確認（AC-03）: 誤ったパスワードで `/auth/v1/token?grant_type=password` を 5 回叩き、
--       SELECT * FROM audit_logs WHERE action='login_failed' AND details->>'source'='auth_hook'
--         ORDER BY created_at DESC LIMIT 10;
--       SELECT * FROM admin_login_attempts;
--     に 5 件 / attempt_count=5 / locked_until 非 NULL が残ることを確認する。
--     正しいパスワードでログインできること（フックが reject を返さないこと）も必ず確認する。
--     ※ 有効化できない / プランで使えない場合も、問題A・C・D は本 migration だけで閉じている。
--        その場合 login_failed の記録は残らなくなる（＝偽造可能な記録が無くなるのと引き換え）。
--
-- (II) GRANT の実測（AC-06）
--     SELECT p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec
--       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--      WHERE n.nspname = 'public'
--        AND p.proname IN ('admin_login_record','admin_login_check','check_email_exists',
--                          'admin_login_password_attempt');
--     → 4 本すべて false であること。
--
-- (III) 汚染調査（FR-292-04）: 上記 §5 の 3 クエリを実行し結果を runbook に記録する。
--
-- (IV) runbook 更新: docs/runbooks/supabase-hardening-checklist.md の
--     「check_email_exists の残余リスクは Turnstile ＋ Auth レート制限で受容」という記述を訂正し、
--     同じ根拠を使っている他の受容判断（REQ-212 / REQ-241）が無いか点検する。
