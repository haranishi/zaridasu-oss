## 要確認

- **`audit_logs` に既に注入行があるか**は未調査（本監査は読み取り専用）。FR-292-04 の判断に必要。件数・`admin_id IS NULL` の分布・`details->>'attempt_count'` の異常値を本番で確認すること。→ 上記「本番適用手順 4」で実施する。
- FR-292-01 (a) を選ぶ場合、**Supabase の Auth Hook（Custom Access Token Hook / Password Verification Hook 等）が本プロジェクトのプランで利用可能か**を確認する。利用できない場合は Edge Function 経由のログイン処理に変える必要があり、フロントの改修範囲が広がる。
  - **進捗**: CLI 側の設定キーは確認済み（Supabase CLI 2.110.0 の config スキーマに `password_verification_attempt` が `enabled` / `uri` / `secrets` を持つフックとして存在する）。~~**本番プロジェクトで Hooks（Beta）が使えるかは Dashboard での確認が残っている**（＝上記「本番適用手順 2」）。~~
  - **確認結果（2026-08-05）**: **使えない**。Password Verification Attempt Hook は Teams / Enterprise 限定で、本プロジェクトの org は Free プラン。Management API が `HOOK_PASSWORD_VERIFICATION_ATTEMPT cannot be configured for this organization` を返し、Dashboard でも同じ理由で失敗する。問題A・C・D は migration だけで閉じているため、失うのは `login_failed` の記録（UI 経由の失敗の監査証跡）だけ。**現状維持（フック無効のまま）で閉じる（2026-09-06 決定）**。Edge Function 経由のログイン処理への置き換えは、記録専用のフックのために行う価値が無いので採らない。
- REQ-241 の受容根拠（Turnstile ＋ Auth レート制限）が**他の判断にも流用されていないか**を `docs/runbooks/supabase-hardening-checklist.md` および REQ-212 / REQ-241 の記述で確認する。同じ誤りが別の受容判断を支えている可能性がある。
  - **確認済み（2026-07-30）**: 結果は `docs/runbooks/supabase-hardening-checklist.md`「REQ-292.【訂正】」節の点検表に記録した。要点は次の 3 点。
    (1) **runbook には当該根拠が一度も書かれていなかった**（migration の「runbook に根拠」は空参照だった）。
    (2) REQ-241（FR-241-02 / NFR-241-03 / AC-02）は同じ誤りを内包するため各所に訂正注記を追記した。
    (3) REQ-212 の FR-212-04（**認証フォーム**への Turnstile 付与）はこの範囲では主張が正しい。ただし REQ-212 の「管理者ログインには IP+email_hash のレート制限が既存」という記述は問題B で否定されたため訂正注記を追記した。あわせて `docs/security/captcha-setup.md` に「Turnstile がカバーする範囲」（`/auth/v1/*` のみ・RPC / テーブル直 INSERT / Edge Function には掛からない）を明記した。
