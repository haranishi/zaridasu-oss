## ザリダス固有の保全対象（どこを・どう書き出すか）

> 揮発しやすい順（請求・各社ログは保持期間で消える / Sentry はプラン保持期間あり）。**消えやすいものから先に**取る。

### 1. Supabase（DB の監査・ログイン・AI ログ）

| 保全対象 | 内容 | 取り方（例） |
|---|---|---|
| `audit_logs` | 管理操作の監査（append-only。ただし欠落し得る） | Dashboard → SQL Editor で下記クエリ → 結果を CSV/JSON エクスポート |
| `admin_login_attempts` | ログイン失敗・ロック状況（`email_hash` / `ip` / `user-agent`） | 同上 |
| `ai_call_logs` | Gemini 呼び出し（`error_kind` 等。課金 / 不正利用の痕跡） | 同上 |
| `reports` / `posts` の該当行 | 漏洩・改ざんが疑われる対象データ | 該当 ID を絞って SELECT → エクスポート（**消す前に**） |
| Supabase Logs（API / Auth / Postgres / Edge） | アクセス・認証イベント | Dashboard → Logs → 期間指定でエクスポート |

```sql
-- 監査ログ（直近の不審操作。期間は調整）
select id, admin_id, action, target_type, target_id, details, created_at
from audit_logs
where created_at > now() - interval '7 days'
order by created_at desc;

-- ログイン試行（失敗・ロックの痕跡）
select id, email_hash, ip, user_agent, success, attempted_at, locked_until
from admin_login_attempts
where attempted_at > now() - interval '7 days'
order by attempted_at desc;

-- AI 呼び出し（課金 / 認証失敗の痕跡）
select id, function_name, status, error_kind, error_message, created_at
from ai_call_logs
where created_at > now() - interval '7 days'
order by created_at desc;
```

> 列名はスキーマ（`supabase/schema.sql`）に合わせて適宜調整する。**保全は SELECT/エクスポートのみ**。対象行を `UPDATE`/`DELETE` しない（封じ込めで削除が必要でも、先にエクスポート）。

### 2. Sentry（エラー・例外イベント）

- 該当期間のイベント / issue を確認し、**スクショ + イベント JSON をエクスポート**して保存する。
- Sentry は PII スクラビング済み（REQ-211）。それでも保全物の取り扱いは PII 同等に注意。
- プランの保持期間（retention）で古いイベントは消える → **早めに**取得。

### 3. Vercel（デプロイ・課金・アクセス）

- **Deployments**: 不審なデプロイの有無・コミット・実行者・時刻をスクショ。
- **Usage / Billing**: 利用量グラフ・請求額・Spend Management の状態をスクショ（→ 課金異常は [03](./03-cloud-billing-anomaly.md)）。
- **Logs / Firewall**: アクセス急増・攻撃元の痕跡があればエクスポート。

### 4. Google Cloud / AI Studio（Gemini）

- **課金 / 予算**: Billing の利用明細・予算アラート履歴・Cost Anomaly をスクショ。
- **API キー**: AI Studio / GCP のキー一覧・最終利用・制限設定をスクショ（**キー値は写さない / 末尾数文字のみ**）。
- **IAM / 監査ログ**: Cloud Audit Logs に身に覚えのない権限変更・操作がないかエクスポート。

### 5. GitHub（漏洩・改ざん）

- **Secret scanning アラート**: Security タブのアラート（検出された秘密の種別・コミット）をスクショ。**秘密値そのものはコピーしない**。
- **コミット / PR / Actions ログ**: 不審な push・ワークフロー実行・self-hosted runner 等の痕跡。
- **Audit log（Org/個人設定）**: 権限変更・トークン発行・連携アプリの追加。

### 6. Resend（メール送信）

- 送信ログ（誤送信・大量送信の有無）・API キーの利用状況・DMARC レポートの異常をスクショ / エクスポート。

---
