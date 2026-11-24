## 目的

- ザリダスが送る 2 系統のメール（Resend 通知 / Supabase Auth 認証）について、送信ドメインの **SPF / DKIM / DMARC** を整備し、**なりすましを防止**しつつ **到達性（迷惑メール回避）を確保**する。
- 送信元（From）ドメインをコード・設定間で統一し、ドリフトを解消する。
- DMARC を `p=none`（監視）から段階的に `quarantine` → `reject` へ強化する運用を確立し、レポート（`rua`）で認証状況を可視化する。
- 上記が DNS チェックや DMARC レポートで**検証可能**な状態にする。

## 要件

### 機能要件

- [ ] FR-219-01: **SPF を 1 本に集約する。** メール送信ドメイン `zarigani-das.com` の TXT に `v=spf1 ...` を**1 レコードだけ**置く（複数 SPF レコードは無効）。Resend が指定する送信元（`include:` 等）を含め、**DNS ルックアップ 10 回以内**に収める。導入初期は末尾 `~all`（softfail）で開始し、運用が安定したら **`-all`（hardfail）**へ移行する。
- [ ] FR-219-02: **DKIM を登録する。** Resend が払い出す DKIM レコード（`resend._domainkey.zarigani-das.com` 等の CNAME / TXT）を `zarigani-das.com` の DNS に登録し、**鍵長は 2048 ビットを推奨**する。Resend ダッシュボードでドメイン検証（Verified）を完了させる。
- [ ] FR-219-03: **DMARC を `p=none` + `rua=` で開始する。** `_dmarc.zarigani-das.com` の TXT に最低限 `v=DMARC1; p=none; rua=mailto:<集約レポート受信アドレス>;` を設定し、集約レポートを受信して SPF/DKIM のアライメント（pass 率）を監視する。レポート受信用アドレスは運用者が受け取れるもの（例: 管理者メール）にする。
- [ ] FR-219-04: **DMARC を段階的に強化する。** `p=none` でのレポートで認証漏れ（正規送信なのに SPF/DKIM が fail/未アライン）を洗い出して修正したのち、**`p=quarantine`（pct を段階的に引き上げ）→ `p=reject`** へ移行する。各段階の判断基準（例: pass 率 99% 以上が一定期間継続）を運用メモに残す。
- [ ] FR-219-05: **通知メール（Resend）の送信元 From を統一・一元化する。** 現状ハードコードされている 3 関数（`notify-post-status/index.ts:224`、`notify-comment/index.ts:134`、`notify-gemini-key-failure/index.ts:227`）の From を、`notify-survey-request` と同様に環境変数（`NOTIFY_FROM_EMAIL`、既定 `ザリダス <noreply@zarigani-das.com>`）から取得する形に揃え、送信ドメイン変更時に DNS と一括で整合できるようにする。（このコード変更のみが本 REQ におけるアプリ側の変更。From アドレスのドメインは DNS で認証済みのものに限る。）
- [ ] FR-219-06: **認証メール（Supabase Auth）の送信ドメインを決定し、選んだ方式に応じて DNS を整える。** 次のいずれかを選択する：
  - (a) **カスタム SMTP 有効化（推奨・本番）**: `supabase/config.toml:64-71` の `[auth.email.smtp]` ブロック（`host = "smtp.resend.com"` / `admin_email = "noreply@zarigani-das.com"` / `pass = env(RESEND_SMTP_KEY)`）を有効化（または Supabase Dashboard > Authentication > SMTP で設定）し、送信ドメイン `zarigani-das.com` に対し FR-219-01〜04 と同じ SPF/DKIM/DMARC を適用する。これにより認証メールも自ドメイン・自管理レピュテーションで送れる。
  - (b) **Supabase 既定送信を継続**: 既定の Supabase 送信ドメインに依存することを明示的に許容する場合は、その制約（ブランド不一致・送信レート/到達性が Supabase 依存）を運用メモに記録する。この場合 `zarigani-das.com` 側で認証メールの DNS 整備は不要だが、(b) は本番非推奨とする。
- [ ] FR-219-07: **Web 専用ドメイン `zaridasu.com` のなりすまし対策。** `zaridasu.com` をメール送信に使わない方針であれば、`zaridasu.com` に対して厳格 SPF（`v=spf1 -all`）と DMARC `v=DMARC1; p=reject; rua=...;`、可能なら null-MX（`. IN MX 0 .`）を設定し、`zaridasu.com` を騙る送信を拒否させる。送信に使う/使わないドメインの一覧を運用ドキュメント化する。
