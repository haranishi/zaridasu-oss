# メール送信ドメイン認証 運用手順書（SPF / DKIM / DMARC）

> 参照要件: REQ-219（FR-219-01〜07 / NFR-219-01〜04 / AC-01〜08）
> 関連: REQ-234（ライフサイクルメール＝本書の到達性整備が前提）、REQ-211（ログの PII マスク）、REQ-237（Web Push＝相補チャネル）、REQ-131（webhook 共有秘密）
> 所要時間: 初回セットアップ **60 分以内**（DNS 反映待ちを除く）+ DMARC 監視は数週間かけて段階強化

---

## これは何か

ザリダスが送るメール（通知メール = Resend / 認証メール = Supabase Auth）を、受信側に
「なりすましでない」と認めさせるための DNS・外部サービス設定の手順書。SPF / DKIM / DMARC の
初期設定から、DMARC を `p=none` → `quarantine` → `reject` へ段階的に上げる判断基準と記録までを扱う。

## 目的・背景

到達性が落ちると、確認メールやパスワードリセットが届かず参加者獲得に直接損失が出る。
一方で設定を誤ると正規メールを自分で誤拒否させてしまう。そのため作業のほぼ全体が
**DNS と外部ダッシュボードの人手運用**であり、コード変更は From の一元化だけに留めている。

## 主要な決定事項（要点）

- **中心は DNS / 外部サービス設定。コード変更は最小**（From を `NOTIFY_FROM_EMAIL` に一元化した FR-219-05 のみ）。
- **メールは `zarigani-das.com` から送る。`zaridasu.com` は Web 専用で送らない**（後者は `-all` / `p=reject` / null-MX でなりすましを拒否）。
- **SPF はルート TXT に 1 本だけ。** 2 本以上あると PermError で全 SPF が無効になる。ルックアップは 10 回以内。
- **DMARC を `reject` へ一気に上げない**（NFR-219-03）。`p=none` で pass 率を確認 → `quarantine`（`pct` 段階） → `reject`。`reject` 到達時に SPF を `~all`→`-all`。
- **認証メールは方針 (a)（Resend のカスタム SMTP）を推奨**。ドメインが通知メールと揃い DNS を使い回せる。方針 (b)（Supabase 既定送信）を選ぶなら制約を許容した判断を移行ログに残す。
- **秘密値は DNS にもコミットにも置かない。** `RESEND_API_KEY` / `RESEND_SMTP_KEY` は Dashboard の Secrets / SMTP 設定のみ。
- 本書の DNS レコード値はすべて**例示プレースホルダ**。実値は各ダッシュボードの表示に従う。

## 各部品

- [01-prerequisites-and-domains.md](./email-authentication/01-prerequisites-and-domains.md) — §0 重要な前提（読み飛ばし厳禁）、§1 送信ドメイン一覧（使う / 使わない・統一方針）と From 一元化の実装状況（参照する関数の表）。
- [02-resend-spf-dkim-dmarc.md](./email-authentication/02-resend-spf-dkim-dmarc.md) — §2 通知メール（Resend）の認証整備。ドメイン検証、SPF の 1 本集約、DMARC `p=none` + `rua` の開始。
- [03-auth-email-and-web-domain.md](./email-authentication/03-auth-email-and-web-domain.md) — §3 認証メール（Supabase Auth）の方針 (a) / (b) と設定手順、§4 Web 専用ドメイン `zaridasu.com` のなりすまし対策。
- [04-verification-and-dmarc-rollout.md](./email-authentication/04-verification-and-dmarc-rollout.md) — §5 検証（`dig` コマンドと実送信ヘッダ確認）、§6 DMARC 段階移行の判断基準と移行ログ表。
- [05-troubleshooting-and-drift-check.md](./email-authentication/05-troubleshooting-and-drift-check.md) — §7 トラブルシュート（症状 / 原因 / 対処）、§8 送信ドメイン変更時のドリフト防止チェックリスト。
