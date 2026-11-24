## 1. 内部関係者（プレースホルダ）

> 一人運用でも、立場上の連絡先・代替手段を埋めておくと事故時に迷わない。**実値はここに書かず**、安全な場所で管理。

| 役割 | 連絡先 | 備考 |
|---|---|---|
| 運用責任者（本人） | `<安全な場所で管理>` | 第一対応者 |
| 予備連絡手段 | `<予備メール / 連絡手段>` | 本番メールが使えない時用 |
| 指導教員 / 研究指導 | `<プレースホルダ>` | 卒研 PF として、漏洩・重大障害時に共有が要るか事前に確認しておく |
| 所属機関の相談窓口 | `<プレースホルダ>` | 大学等に情報セキュリティ / 個人情報の相談窓口があれば |

---

## 2. 各社サポート / セキュリティ窓口

> ログインして該当プロジェクトを選んでから問い合わせるとスムーズ。緊急時は「セキュリティ」「不正利用」「課金異常」を明示する。

| サービス | 主な用途（インシデント時） | 入口（⚠️要確認） |
|---|---|---|
| **Supabase** | DB/Auth/Storage の不正アクセス・乗っ取り・課金・データ復旧 | Dashboard → Support（プロジェクト選択後）/ `https://supabase.com/support` / セキュリティ報告窓口 `security@supabase.io` ⚠️要確認 |
| **Vercel** | デプロイ不正・課金急増・DDoS / アクセス異常 | Dashboard → Help / `https://vercel.com/help` / Spend Management・Firewall 設定 |
| **GitHub** | 秘密漏洩・アカウント乗っ取り・不正 push | `https://support.github.com/` / アカウント復旧・Secret scanning |
| **Google Cloud / AI Studio（Gemini）** | 課金異常・IAM 不正・キー不正利用 | Cloud Console → Support / Billing サポート / `https://aistudio.google.com` |
| **Sentry** | エラー監視・イベント保全に関する問い合わせ | `https://sentry.io/support/` |
| **Resend** | メール不正送信・キー不正利用 | `https://resend.com/` のサポート / ダッシュボード |
| **ドメイン / DNS レジストラ** | `zaridasu.com` / `zarigani-das.com` の乗っ取り・DNS 改ざん | 各レジストラのサポート（契約先を控えておく）⚠️要確認 |

---
