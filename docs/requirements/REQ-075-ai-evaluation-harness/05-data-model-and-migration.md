## データモデル・DB 設計

### 案 A: `audit_logs` 拡張（推奨）
既存 `audit_logs` テーブルの `metadata` JSONB に AI 呼び出し情報を追記する方式。テーブル新設不要。

**追加メタデータスキーマ:**
```json
{
  "ai_call": {
    "function": "analyze-audio",
    "model": "gemini-2.5-flash",
    "input_tokens": 980,
    "output_tokens": 120,
    "latency_ms": 2400,
    "status": "success"
  }
}
```

**集計クエリ例:**
```sql
SELECT
  date_trunc('day', created_at) AS day,
  metadata->'ai_call'->>'function' AS function,
  metadata->'ai_call'->>'model' AS model,
  COUNT(*) AS calls,
  SUM((metadata->'ai_call'->>'input_tokens')::int) AS input_tokens,
  SUM((metadata->'ai_call'->>'output_tokens')::int) AS output_tokens
FROM audit_logs
WHERE metadata ? 'ai_call'
  AND created_at >= now() - interval '30 days'
GROUP BY 1, 2, 3;
```

### 案 B: `ai_call_logs` 新設
専用テーブルを切る案。集計性能は良いが新設コスト発生。

**スキーマ:**
| カラム名 | 型 | NULL | デフォルト | 説明 |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | 主キー |
| post_id | uuid | YES | — | posts.id への参照（再判定時は同じ post_id 複数行） |
| function_name | text | NO | — | 'analyze-audio' or 'analyze-image' |
| model | text | NO | — | Gemini モデル ID |
| input_tokens | int | YES | — | 入力トークン数 |
| output_tokens | int | YES | — | 出力トークン数 |
| latency_ms | int | YES | — | API レイテンシ |
| status | text | NO | — | 'success' / 'error' / 'skipped' |
| error_message | text | YES | — | エラー時のメッセージ |
| created_at | timestamptz | NO | now() | |

**インデックス:**
- `idx_ai_call_logs_created_at ON (created_at DESC)`
- `idx_ai_call_logs_function_model ON (function_name, model)`

**RLS ポリシー:**
- SELECT: admin のみ
- INSERT: service_role のみ（Edge Function から）
- UPDATE/DELETE: なし

**選定方針:** **案 A（audit_logs 拡張）を第一候補**。理由は新規テーブル運用コスト回避とスキーマ進化の容易さ。集計性能に問題が出たら案 B に移行。

---

## マイグレーション計画

### Migration-075-01: 案 A 採用時
- マイグレーション不要（`audit_logs.metadata` JSONB は既存）
- ただし `audit_logs` を service_role で書ける RLS は要確認

### Migration-075-02: 案 B 採用時のみ
- `supabase/migrations/YYYYMMDD_add_ai_call_logs.sql` を新設
- ロールバックは `DROP TABLE ai_call_logs CASCADE`

---
