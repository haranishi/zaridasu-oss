> [!important] 本要件の性質
> **コード（SQL migration）＋フロントエンドの変更が主体**であり、本番への手作業は migration 適用のみ。
> 対象は「`anon` に EXECUTE が GRANT されている SECURITY DEFINER 関数」2 本（`admin_login_record` / `check_email_exists`）である。どちらも**関数内に認可チェックが無く、呼び出し側の申告を信じる**構造になっている点が共通の根本原因である。

## 背景

`REQ-221` が `public` スキーマの関数から PUBLIC の自動 EXECUTE を剥がした結果、`anon` から呼べる関数は「明示 GRANT された関数」だけに絞られている。監査ではその明示 GRANT 済み RPC を個別に確認し、大半は fail-closed だった（`get_user_progress` / `get_user_collection` は `is_owner OR is_public`、unsubscribe 系は不透明 UUID のみ、KPI 系は `_kpi_assert_admin()` ゲート）。**例外が以下 2 本である。**

---

### 問題A: `p_success=true` の 1 回呼び出しで管理者ログインのロックアウトを無制限に回避できる — High

`public.admin_login_record(p_email text, p_success boolean)`
定義: `supabase/migrations/20260513000013_admin_login_rate_limit_audit.sql:78-136` ／ 正本 `supabase/schema.sql:1556-1591`
GRANT: 同 migration `:135-136` ／ `schema.sql:1592-1593`（`TO anon, authenticated`）

関数は `SECURITY DEFINER` で `admin_login_attempts` の RLS をバイパスする。そして `p_success` は**呼び出し側の申告以外に根拠を持たない**。

```sql
-- 20260513000013_admin_login_rate_limit_audit.sql:95-101
IF p_success THEN
  DELETE FROM admin_login_attempts WHERE email_hash = v_hash AND ip = v_ip;
  INSERT INTO audit_logs (...) VALUES (auth.uid(), 'login_success', ...);
  RETURN jsonb_build_object('locked', false);
END IF;
```

したがって、公開 anon キーだけで次を実行するとカウンタ行が削除され、`attempt_count` が 0 に戻る。

```
POST /rest/v1/rpc/admin_login_record
{"p_email":"<管理者のメール>","p_success":true}
```

「15 分以内 5 回失敗で 15 分ロック」（`:91-93` の `c_max=5` / `c_window` / `c_lock`）は、失敗 4 回ごとにこの 1 リクエストを挟むだけで**無制限に回避できる**。ロック機構は事実上存在しない。
