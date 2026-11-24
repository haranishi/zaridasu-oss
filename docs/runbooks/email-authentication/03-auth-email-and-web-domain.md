## 3. 認証メール（Supabase Auth）の方針決定と設定（FR-219-06 / AC-06）

Supabase Auth の確認・パスワードリセット・メール変更確認メールの送信ドメインを決める。

### 方針 (a)（推奨・本番）: カスタム SMTP（Resend）を有効化

認証メールも `zarigani-das.com` から自管理レピュテーションで送る。通知メールと同一ドメインに揃い、
SPF/DKIM/DMARC を 1 ドメインで整備できる。

1. **原則 Supabase Dashboard → Authentication → Email → SMTP Settings** で設定する
   （秘密値 `RESEND_SMTP_KEY` を Git に置かないため）。
   - Host: `smtp.resend.com` / Port: `465` / Username: `resend` / Password: `RESEND_SMTP_KEY`（Resend の SMTP キー）
   - Sender email: `noreply@zarigani-das.com` / Sender name: `ザリダス`
2. CLI で `config.toml` から本番反映する運用なら、`supabase/config.toml` の `[auth.email.smtp]` ブロック
   （現在コメントアウト）をアンコメントし、`pass = "env(RESEND_SMTP_KEY)"` を Secrets/env から注入する。
   - **ローカル開発では有効化しない**（Mailpit `[inbucket]` にメールが溜まる構成のため）。
3. 送信ドメイン `zarigani-das.com` に対し **§2 と同じ SPF/DKIM/DMARC** が効いているので追加 DNS は不要
   （通知メールと同一ドメインのため使い回せる）。
4. テスト送信（確認メール 1 通）のヘッダで `zarigani-das.com` からの SPF/DKIM/DMARC=pass を確認（AC-06）。

### 方針 (b)（本番非推奨）: Supabase 既定送信を継続

- カスタム SMTP を設定しない場合、認証メールは **Supabase 既定の共有送信ドメイン**から送られる。
- 制約: ブランド不一致（`zarigani-das.com` ではない）・送信レート/到達性が Supabase 依存
  （無料プランは送信制約あり）。**この制約を許容する判断を本書の §6 記録に残すこと。**
- この場合 `zarigani-das.com` 側で認証メールの DNS 整備は不要。ただし本番では (a) を推奨。

> 現状: `supabase/config.toml` の `[auth.email.smtp]` はコメントアウト＝ローカルは Mailpit、
> 本番は方針未確定（既定送信）。**本番投入時に (a) を選び Dashboard で設定する**のが推奨。

---

## 4. Web 専用ドメイン `zaridasu.com` のなりすまし対策（FR-219-07 / AC-07）

`zaridasu.com` をメール送信に使わない方針なので、騙りを拒否させる。

```dns
; SPF: どこからの送信も許可しない
zaridasu.com.         TXT  "v=spf1 -all"
; DMARC: 認証されない zaridasu.com 差出人は拒否
_dmarc.zaridasu.com.  TXT  "v=DMARC1; p=reject; rua=mailto:dmarc-reports@zaridasu.com;"
; null-MX: このドメインはメールを受け取らない（可能なら）
zaridasu.com.         MX   0 .
```

- これにより `*@zaridasu.com` を騙る送信は受信側で SPF=fail / DMARC=reject になり弾かれる。
- もし将来 `zaridasu.com` からも**送る**方針に変えるなら、ここを `-all` のままにせず、
  §2 と同様に Resend の DKIM/SPF と DMARC（段階移行）を整える（§1 のドメイン統一方針を参照）。

---
