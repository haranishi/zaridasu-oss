### 非機能要件

- [ ] NFR-219-01: **シークレットを露出しない。** API キー・SMTP パスワード（`RESEND_API_KEY` / `RESEND_SMTP_KEY` 等）は DNS レコードや本書・コミットに含めない。DNS に置くのは公開前提の SPF/DKIM/DMARC レコードのみ。
- [ ] NFR-219-02: **ドリフト防止。** From のドメイン・`config.toml` の SMTP 設定・実際の DNS レコードの 3 者が乖離しないよう、送信ドメイン（および From 既定値）を変更する際の手順を運用ドキュメントに残す。コード側の既定 From は `zarigani-das.com` に統一する（FR-219-05）。
- [ ] NFR-219-03: **到達性の維持。** DMARC を `reject` に上げる前に、Resend 検証済み・SPF/DKIM アライン pass を必ず満たす。段階移行を飛ばして `reject` にしない（正規メールの誤拒否を防ぐ）。
- [ ] NFR-219-04: **fail-soft の維持。** 既存実装は `RESEND_API_KEY` 未設定時にメール送信をスキップして 200 を返す fail-soft（例 `notify-post-status/index.ts:76-83`、`notify-survey-request/index.ts:129-130`）になっている。From 統一（FR-219-05）でこの挙動を壊さないこと。
