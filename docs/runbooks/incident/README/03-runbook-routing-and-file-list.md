## 事象 → 該当 runbook 対応表

| 気づいたきっかけ・症状 | 該当 runbook |
|---|---|
| API キー / service-role / Resend / Gemini / Webhook 秘密 / Sentry トークン / VAPID 秘密鍵を **GitHub・チャット・ログ・スクショに出してしまった**、Secret scanning アラート、公開リポジトリに秘密が見えた | [01-secret-leak.md](./01-secret-leak.md) |
| 管理者 / 一般ユーザーのアカウントに **身に覚えのないログイン・操作**、パスワードリセット濫用、`admin_login_attempts` の連続失敗 / ロック、`audit_logs` に不審な admin 操作 | [02-account-takeover.md](./02-account-takeover.md) |
| Vercel / Supabase / Google Cloud(Gemini) の **利用量・請求が急増**、身に覚えのない IAM 変更・デプロイ、予算アラート（実績 / 予測）の発火 | [03-cloud-billing-anomaly.md](./03-cloud-billing-anomaly.md) |
| **個人データ（メール / IP / 位置情報 / 写真・音声 / プロフィール）が外部に出た / 出た疑い**、誤公開、誤送信、不正アクセスによる持ち出し | [04-personal-data-breach.md](./04-personal-data-breach.md) **(最重要)** |
| 本番ダウン、投稿 / 地図 / AI 種判定 / 認証が動かない、表示が壊れた、**データ損失の疑い** | [05-service-outage.md](./05-service-outage.md) |
| （上記いずれでも）証拠の取り方が分からない | [evidence-preservation.md](./evidence-preservation.md) |
| 連絡先・公的窓口・サポート導線・一次連絡文面 | [contacts.md](./contacts.md) |

> 複数に該当することは多い（例: 秘密漏洩 → 課金異常 → 個人データ漏洩）。その場合は **最も被害が重いもの（通常は個人データ漏洩）を主 runbook** にしつつ、関連 runbook の封じ込めも並行する。

---

## ファイル一覧（このフォルダ）

| ファイル | 役割 |
|---|---|
| `README.md`（本書） | 索引・共通初動 8 ステップ・共通 NG |
| [`01-secret-leak.md`](./01-secret-leak.md) | シークレット / 鍵漏洩 |
| [`02-account-takeover.md`](./02-account-takeover.md) | アカウント乗っ取り（管理者 / ユーザー） |
| [`03-cloud-billing-anomaly.md`](./03-cloud-billing-anomaly.md) | クラウド課金異常 |
| [`04-personal-data-breach.md`](./04-personal-data-breach.md) | 個人データ漏洩 + 個人情報保護委員会報告判断 |
| [`05-service-outage.md`](./05-service-outage.md) | サービス障害 |
| [`evidence-preservation.md`](./evidence-preservation.md) | 証拠保全（全 runbook 共通） |
| [`contacts.md`](./contacts.md) | 連絡先・相談窓口・一次連絡文面テンプレ |

---
