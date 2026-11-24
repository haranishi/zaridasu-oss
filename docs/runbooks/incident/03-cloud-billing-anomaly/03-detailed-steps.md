## 詳細手順

### Step 1. 記録・保全（削除する前に）

- どのサービス・どのリソース・いつから・現在いくらか、を [evidence-preservation.md](./evidence-preservation.md) の記録テンプレに。
- **保全（消える前に）**:
  - Google Cloud Billing: 利用明細・予算アラート履歴・Cost Anomaly をスクショ。
  - Vercel: Usage / Billing / Spend Management の状態、Deployments（不審デプロイ）をスクショ。
  - Supabase: Usage（DB / Storage / Egress）、`ai_call_logs` をエクスポート。
  ```sql
  -- AI 呼び出しの急増・失敗の確認
  select function_name, status, error_kind, count(*) as n
  from ai_call_logs
  where created_at > now() - interval '24 hours'
  group by function_name, status, error_kind
  order by n desc;
  ```

### Step 2. 封じ込め（暴走源を止める）

- 上の **段階的 kill switch** を、原因の見当に応じて引く。
  - AI 課金が主因 → 段階 2（`AI_ANALYSIS_ENABLED=false`）。
  - bot / 特定 IP → 段階 1（レート制限・Firewall）。
  - キー漏洩が疑われる → 段階 5（失効）+ [01-secret-leak.md](./01-secret-leak.md)。
- 止めたら、利用量グラフが**頭打ちになる**ことを確認（効いているか）。

### Step 3. 切り分け（不正 / バグ / 正当）

| 兆候 | 推定原因 | 次の runbook |
|---|---|---|
| 身に覚えのない IAM / デプロイ / キー利用 | **不正アクセス / 漏洩** | [02](./02-account-takeover.md) / [01](./01-secret-leak.md) |
| `ai_call_logs` に同一対象の**リトライが連鎖** | **バグ（リトライ暴走）** | REQ-218 のリトライ設計を確認 |
| 投稿 / アクセスの自然増に比例 | **正当な増加** | 予算・クォータの見直し（停止は最小限） |
| 大量の bot 投稿・単一 IP 集中 | **悪用 / スクレイピング** | [02](./02-account-takeover.md)＋レート制限（REQ-212） |

### Step 4. 復旧

- 原因を塞いだうえで、停止した機能（AI など）を**段階を戻して**再開。
- 再開後も**クォータ / スペンドキャップ / キー制限を残す**（また暴走しないように）。

---
