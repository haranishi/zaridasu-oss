### 本番適用手順（コード変更のほかに必要な操作）

1. **`supabase db push`** で `20260730000001_req292_authz_defects_anon_granted_rpc.sql` を適用する。
2. **Auth Hook の有効化: 不可（2026-08-05 確認・2026-09-06 に方針確定）**。Password Verification Attempt Hook は
   Teams / Enterprise 限定の機能で、本プロジェクトの org（haranishi's Org）は Free プラン。Management API は
   `HOOK_PASSWORD_VERIFICATION_ATTEMPT cannot be configured for this organization` を返し、Dashboard で操作しても
   同じ理由で失敗する（手順の問題ではない）。フック本体 `admin_login_password_attempt` は常に
   `{"decision":"continue"}` を返す記録専用の fail-open 実装なので、有効化できても 5 回失敗のロックは発火しない。
   実効的な防御は Supabase Auth 組み込みのレート制限のみで、旧実装も `/auth/v1/token` の直叩きには無力だったため、
   **このリリースで実効防御は減っていない**。失われるのは UI 経由の失敗の監査証跡だけ。**現状維持（無効のまま）で閉じる**。
   プランを上げた場合だけ、旧手順（Dashboard > Authentication > Hooks > "Password Verification Attempt" に
   `public.admin_login_password_attempt` を指定して Enable → 5 回失敗で `audit_logs` 5 件と `locked_until` 非 NULL を確認 →
   正しいパスワードでログインできることを確認）を再開する。
3. **GRANT の実測（AC-06）**:
   ```sql
   SELECT p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('admin_login_record','admin_login_check','check_email_exists',
                        'admin_login_password_attempt');
   ```
   → 4 本すべて `false` であること。
   **実測（2026-08-05・本番）**: anon キーで `check_email_exists` / `admin_login_check` / `admin_login_record` を直接呼び、
   3 本とも `401 permission denied` を確認した。`admin_login_password_attempt` は上記 2 のとおり未配線。
4. **汚染調査（FR-292-04）**: migration 内 §5 の 3 クエリ（`source` 未記録の `login_failed` 分布 /
   `admin_id IS NULL` の `login_success` / 想定外 IP・異常 `attempt_count`）を実行し、結果を runbook の
   点検チェック表に記録する。`admin_id IS NULL` の `login_success` が 0 件かつ他に異常が無ければ
   FR-292-04(a) で足りる。汚染が確認された場合のみ、一度限りの整理 migration を別途起票する。
5. **runbook 更新**: 上記の実測結果を `docs/runbooks/supabase-hardening-checklist.md` のリリース前
   点検チェック表（REQ-292 の 3 行）に記入する。

### 未達・次の波

- **AC-03 の実測**（`/auth/v1/token` を直接 5 回失敗させてサーバー側に 5 件残ること）は Auth Hook が
  Free プランで有効化できないため実施できない。**プラン制約による未達として閉じる（2026-09-06）**。CI では pgTAP が
  フック関数の直接呼び出しで同等の不変条件（5 回で `attempt_count=5`・`locked_until` 非 NULL・`source=auth_hook` 5 件）を
  固定化済みなので、プランを上げてフックを配線した時点で AC-03 を再開できる。
- **汚染調査（FR-292-04・手順 4）と runbook の点検表への記入（手順 5）** は未実施の運用タスクとして残る。
- 一般ユーザーログインのブルートフォース対策（`admin_login_*` の一般ログインへの転用）は本要件の範囲外。
