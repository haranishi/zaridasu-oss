## 背景

ザリダス（Next.js 15 / Supabase / Vercel）は、2 系統でユーザー宛メールを送信している。

1. **通知メール（Resend）**: Supabase Edge Functions の `notify-post-status` / `notify-comment` / `notify-gemini-key-failure` / `notify-survey-request` が、Resend の HTTP API (`https://api.resend.com/emails`) 経由で投稿ステータス変更・コメント・調査依頼・管理者アラートを配信する。
2. **認証メール（Supabase Auth）**: メールアドレス確認・パスワードリセット・メールアドレス変更確認のメール。テンプレートは `supabase/config.toml` の `[auth.email.template.*]`（`config.toml:73-83`）で定義され、本文 HTML は `supabase/templates/` に置かれている。

これらが受信側で**なりすまし（spoofing）と判定されず**、かつ**迷惑メールフォルダに振り分けられず確実に届く（到達性）**ためには、送信ドメインに対する **SPF / DKIM / DMARC** の DNS 認証レコード整備が前提となる。カスタムドメイン（`@zarigani-das.com`）から送る以上これは必須要件である。

本要件は Obsidian ノート `31_Email_Authentication`（SPF は 1 本集約・末尾 `~all`→最終 `-all`・10 ルックアップ以内 / DKIM 鍵長 2048 推奨・送信サービスの DKIM を DNS 登録 / DMARC は `p=none`+`rua=` で監視開始 → 認証漏れ修正 → `quarantine` → `reject` と段階強化）を下敷きとし、ザリダスの実装に即して具体化したものである。

本件は主に **DNS / インフラ設定の要件**であり、コード変更は「送信元（From）の統一・整理」程度にとどまる。
