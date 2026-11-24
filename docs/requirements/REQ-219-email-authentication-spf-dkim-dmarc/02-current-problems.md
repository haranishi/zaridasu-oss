## 現状の問題

（ファイルパス:行番号、および DNS 設定がリポジトリ管理外で確認できない事実）

### 1. 通知メール（Resend）の送信元ドメインは `zarigani-das.com` で確定しているが、対応する DNS 認証レコードはリポジトリで確認できない

- 送信元（From）の実値はコード上で次のとおり確定している：
  - `supabase/functions/notify-post-status/index.ts:224` → `from: 'ザリダス <noreply@zarigani-das.com>'`
  - `supabase/functions/notify-comment/index.ts:134` → `from: 'ザリダス <noreply@zarigani-das.com>'`
  - `supabase/functions/notify-gemini-key-failure/index.ts:227` → `from: "ザリダス <noreply@zarigani-das.com>"`
  - `supabase/functions/notify-survey-request/index.ts:71` → `const fromEmail = Deno.env.get('NOTIFY_FROM_EMAIL') ?? 'ザリダス <noreply@zarigani-das.com>'`（既定値が同一。`:77` で送信ボディに使用）
- すなわち通知メールの送信ドメインは **`zarigani-das.com`** で統一されている（送信元アドレスは `noreply@zarigani-das.com`）。
- 一方、Resend で必要となる **DKIM（Resend が払い出す `resend._domainkey` 等の CNAME/TXT）と SPF（`include:` または Resend 指定の MX/TXT）、および DMARC（`_dmarc.zarigani-das.com` の TXT）レコードは、DNS ゾーン側の設定でありリポジトリには含まれない**。したがって本リポジトリからは**これらが正しく整備済みか確認できない**。(推測) Resend ダッシュボードでドメイン検証を完了していれば DKIM/SPF は登録済みのはずだが、DMARC は Resend のドメイン検証では必須化されないことが多く、**`_dmarc` レコードが未整備の可能性がある**。

### 2. 認証メール（Supabase Auth）の SMTP がコメントアウトされており、現状は Supabase 既定ドメインから送信されている

- `supabase/config.toml:63-71` の `[auth.email.smtp]` ブロックは**全行コメントアウト**されている：
  ```toml
  # 本番環境では SMTP を有効にすること（Supabase Dashboard > Authentication > SMTP Settings）
  # [auth.email.smtp]
  # enabled = true
  # host = "smtp.resend.com"
  # port = 465
  # user = "resend"
  # pass = "env(RESEND_SMTP_KEY)"
  # admin_email = "noreply@zarigani-das.com"
  # sender_name = "ザリダス"
  ```
- カスタム SMTP が有効化されていない場合、Supabase Auth の確認・リセット・変更確認メールは **Supabase 既定の共有送信ドメイン**から送られる。(推測) この既定送信は Supabase 側で SPF/DKIM 認証されているが、**`zarigani-das.com` / `zaridasu.com` のドメインからの送信ではない**ため、ブランド一貫性に欠け、送信レピュテーションを自ドメインで管理できず、また到達性が Supabase 既定枠（無料プランは送信レート・到達性に制約あり）に依存する。
- 本番でカスタム SMTP（コメント中の `smtp.resend.com`）を有効化する場合、その送信ドメインに対しても **SPF / DKIM / DMARC** を整える必要がある。(推測) これらの DNS レコードもリポジトリ管理外であり、現状の整備状況は確認できない。

### 3. Web ドメイン（`zaridasu.com`）とメール送信ドメイン（`zarigani-das.com`）が異なり、DMARC アライメントの確認が必要

- サイト URL・Auth の `site_url` は **`zaridasu.com`**：
  - `supabase/config.toml:45` → `site_url = "https://zaridasu.com"`
  - `src/lib/constants.ts:8` → `BASE_URL ... || 'https://zaridasu.com'`
  - 各 Edge Function の `SITE_URL` 既定値も `https://zaridasu.com`（例 `notify-post-status/index.ts:30`、`notify-survey-request/index.ts:70`、`notify-comment/index.ts:9`、`notify-gemini-key-failure/index.ts:38`）。
- 一方、**メール送信ドメインは `zarigani-das.com`**（上記 1・2）。Web と Mail で**別ドメインを併用**している。
- DMARC は送信ドメイン（`zarigani-das.com`）の `_dmarc` を評価するため、技術的にはこの不一致自体は直ちに問題ではない。ただし運用上、**どちらのドメインから何を送るのか**を明確化し、送信に使うドメイン（`zarigani-das.com`）側で DMARC を整備することが必要。(推測) `zaridasu.com` をメール送信に使う予定がないなら、`zaridasu.com` 側にも「メールを送らない」ことを宣言する null-MX / 厳格 SPF（`v=spf1 -all`）＋ `p=reject` の DMARC を置いて、`zaridasu.com` を騙ったなりすましを抑止することが望ましい。

### 4. 環境変数名は定義されているが、DNS 認証はコードの責務外

- メール関連の環境変数名は `.env.example` 等で定義済み：`RESEND_API_KEY`（`.env.example:25`）、`SITE_URL`（`.env.example:26`）、`ADMIN_NOTIFY_EMAIL`（`.env.example:47`）、および Edge Function 側の `NOTIFY_FROM_EMAIL`（`notify-survey-request/index.ts:71`）、Auth SMTP 用の `RESEND_SMTP_KEY`（`config.toml:69` のコメント）。
- これらはあくまでアプリ／関数からの送信設定であり、**SPF/DKIM/DMARC の成立はアプリの外（DNS ゾーン）でしか担保できない**。本リポジトリの自動テスト・CI では DNS レコードの正否を検証していない（確認した限り該当テストは存在しない）。

> 注: 秘密値（API キー・SMTP パスワード等）は本書では扱わない。変数「名」のみを参照する。
