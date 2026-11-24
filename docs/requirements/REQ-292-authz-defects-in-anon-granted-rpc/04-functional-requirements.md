## 機能要件

- **FR-292-01（ロック判定をクライアント申告から切り離す）**: `admin_login_record` の `p_success=true` 経路を `anon` から呼べないようにする。方式は次のいずれかを選ぶ。**判断点**（実装前に決めること）:
  - **(a) 推奨: 記録をサーバー側イベントに移す** — Supabase の Auth Hook（またはログイン処理を経由させる Edge Function）から `service_role` で記録し、フロントの RPC 呼び出しを廃止する。これで問題A・B・C が同時に解消し、REQ-149 が本来意図した「サーバー側レート制限」が初めて成立する
  - **(b) 妥協案: 関数を分割する** — `p_success=true` 側（`DELETE` ＋ `login_success` 記録）を `service_role` 限定の別関数に切り出し、`anon` からは「失敗記録のみ」を可能にする。ただし問題B（直叩きでは呼ばれない）は解決しないため、**(b) を選ぶ場合はサーバー側の別のブルートフォース対策（Auth のレート制限設定強化・IP レベルの制限）を併記して補うこと**
- **FR-292-02（anon GRANT の剥奪）**: `admin_login_record` から `anon` の EXECUTE を REVOKE する。`admin_login_check`（ロック状態の読み取りのみ・副作用なし）を `anon` に残すかは判断点だが、残す場合は「任意メールに対してロック状態を問い合わせられる＝管理者メールの当て推量に使える」ため、**`admin_login_check` も剥がす方向を推奨**する（ロック判定をサーバー側に移せばフロントから呼ぶ必要が無くなる）。
- **FR-292-03（login_success 分岐の防御）**: FR-292-01 で経路を変えたうえでも、`login_success` の記録は **`auth.uid()` が実在し、かつその uid のメールが `p_email` と一致するときのみ**行う。`auth.uid()` が NULL の `login_success` 行を作れる余地を残さない。
- **FR-292-04（既存の汚染行の扱い）**: `audit_logs` に既に注入行があるかを調査する（`login_failed` / `login_success` のうち `admin_id IS NULL` かつ `details->>'ip'` が想定外のもの、`attempt_count` が異常なもの）。**判断点**: append-only 設計のため通常の DELETE はできない。(a) 現状を「汚染の可能性あり」と記録して残す、(b) `service_role` による一度限りの整理 migration を書く（append-only の設計意図を破るため理由を migration のコメントに明記）のいずれかを選ぶ。**汚染が確認できない場合は (a) で足りる。**
- **FR-292-05（`check_email_exists` の廃止または要塞化）**: 次のいずれかを選ぶ。**判断点**:
  - **(a) 推奨: RPC を廃止する** — フロントの事前チェック（`src/components/modals/AuthModal.tsx:295-301`）を削除し、重複判定は既に実装済みの `signUp` 後の `identities` 空判定（`AuthModal.tsx:306-312`）＝Supabase Auth の統一エラーに一本化する。UX は「送信前に分かる」から「送信後に分かる」へ劣化するが、表示メッセージ（`auth.errors.alreadyRegistered`）は既存キーがそのまま使えるため i18n の追加は不要
  - **(b) Edge Function 化** — 存在確認を Edge Function へ移し、**関数内で** Turnstile トークンの検証（`https://challenges.cloudflare.com/turnstile/v0/siteverify`）と IP レート制限を実装する。そのうえで RPC からは `anon` GRANT を剥がす
  - どちらを選んでも **`GRANT EXECUTE ON FUNCTION public.check_email_exists(TEXT) TO anon` の剥奪は必須**。加えて REQ-241 の受容根拠が誤っていた事実を `supabase/migrations/` の新 migration コメントと `docs/runbooks/supabase-hardening-checklist.md` に記録する（同じ根拠で他の判断をしていないかの確認も行う）
- **FR-292-06（migration の作法）**: 既存 migration（`20260513000013…` / `20260703000003…`）を書き換えず、**新規 migration で再定義・REVOKE する**。`supabase/schema.sql` も同内容に更新して drift を作らない（`npm run schema:check` の対象）。
