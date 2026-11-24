## データモデル・DB 設計

### テーブル: `ai_cache_registry`
| カラム名 | 型 | NULL | デフォルト | 説明 |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | 主キー |
| function_name | text | NO | — | 'analyze-audio' or 'analyze-image' |
| model | text | NO | — | Gemini モデル ID |
| cache_id | text | NO | — | Gemini cachedContents/xxx |
| expires_at | timestamptz | NO | — | TTL 失効時刻 |
| token_count | int | YES | — | キャッシュ対象のトークン数 |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | refresh 時刻 |

**インデックス:**
- `unique (function_name, model)` — 同一組み合わせは 1 レコード（refresh で UPSERT）
- `idx_ai_cache_expires ON (expires_at)`

**RLS ポリシー:**
- SELECT: service_role のみ
- INSERT/UPDATE: service_role のみ
- DELETE: service_role のみ

---

## マイグレーション計画

### Migration-078-01: ai_cache_registry テーブル新設
```sql
-- Up
CREATE TABLE ai_cache_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name text NOT NULL,
  model text NOT NULL,
  cache_id text NOT NULL,
  expires_at timestamptz NOT NULL,
  token_count int,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (function_name, model)
);

CREATE INDEX idx_ai_cache_expires ON ai_cache_registry (expires_at);

ALTER TABLE ai_cache_registry ENABLE ROW LEVEL SECURITY;

-- service_role 限定（policy 不要、bypass されるため）

-- Down
DROP TABLE ai_cache_registry CASCADE;
```

---
