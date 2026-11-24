## 対象シークレット表（ザリダスで管理している秘密）

> **値は絶対に書かない。** 識別はプロバイダ名・変数名・末尾数文字・キー ID で行う（NFR-220-01）。配置場所は `.env.example` 参照。

| 変数名 | 用途 | 配置 / 発行元 | 漏洩時の主リスク | 失効・ローテーション先 |
|---|---|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | RLS を**バイパス**する全権キー | Supabase Dashboard → API（Edge Functions Secrets） | **最重大**。全データ読み書き・PII 流出・改ざん・削除 | Supabase Dashboard → Settings → API → service_role を **Rotate**（→ 後述「Supabase キー」） |
| `GEMINI_API_KEY` | Gemini 呼び出し（課金） | AI Studio / GCP（Edge Functions Secrets） | 課金暴走・第三者によるAI悪用 | [`gemini-key-rotation.md`](../gemini-key-rotation.md) の手順で発行→差替→旧キー Delete |
| `RESEND_API_KEY` | メール送信 | Resend（Edge Functions Secrets） | なりすまし送信・到達性 / ドメイン評判の毀損 | Resend ダッシュボードでキー再発行 → Secrets 更新 → 旧キー失効 |
| `WEBHOOK_SECRET` | Edge Function webhook の共有秘密 | Supabase（Edge Functions Secrets）/ DB Webhook 側 | 不正な webhook 起動（INSERT トリガ偽装） | 新しい 32byte 乱数を生成 → Secrets と Webhook 設定の**両方**を同時更新 |
| `SENTRY_AUTH_TOKEN` | SourceMap アップロード等 | Sentry（CI / Vercel 環境変数） | Sentry プロジェクトへの不正操作 | Sentry でトークン revoke → 新規発行 → CI / Vercel に再設定 |
| `VAPID_PRIVATE_KEY` | Web Push 署名鍵（**サーバー専用**） | Supabase（Edge Functions Secrets） | push のなりすまし | 鍵ペア再生成（`docs/runbooks/web-push.md`）→ 公開鍵も差替が必要な点に注意 |
| `SUPABASE_DB_URL` 等の DB 接続文字列 | バックアップ等（REQ-217） | GitHub Actions Secrets | DB 直接接続・全データ | DB パスワードのローテーション → Secret 更新 |
| `OPENCAGE_API_KEY` / `GEOAPIFY_API_KEY` / `ONWATER_API_KEY` | 逆ジオ等（任意・従量課金） | Edge Functions Secrets | 課金（限定的） | 各プロバイダで再発行 → Secrets 更新 |
| `SUPABASE_ACCESS_TOKEN` / `SUPABASE_PROJECT_REF` | CLI / デプロイ | GitHub Actions Secrets | プロジェクト操作・デプロイ | アクセストークン revoke → 再発行 |

> 本番 Supabase プロジェクト ref は `edxmkqmjzbarjdgnkcvc`（`docs/runbooks/edge-function-deploy.md` 参照）。

### 即時失効 vs 切替後失効（判断基準）

| 状況 | 判断 |
|---|---|
| 秘密が**公開された / されている**（public repo・公開ログ・第三者の手） | **即時失効**。サービス一時停止より漏洩継続のほうが重い |
| **悪用の痕跡あり**（不審な課金・アクセス・送信） | **即時失効** + 関連 runbook（[03](./03-cloud-billing-anomaly.md) / [04](./04-personal-data-breach.md)）へ |
| service-role / DB 接続文字列 / Resend など**影響が極大**のキー | 原則**即時失効**（被害が桁違い） |
| private のみ・痕跡なし・無停止で切替可能 | **新キー発行 → 差替 → 動作確認 → 旧キー失効**（切替後失効でダウンタイム回避）。ただし「漏洩済み」前提は崩さない |

---
