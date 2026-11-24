### 非機能要件

- [ ] **NFR-126-01: セキュリティ**
  - `health-gemini` は admin 限定（service role 不要、JWT で role check）
  - `notify-gemini-key-failure` の `ai_call_logs.error_message` を本文に貼る際は **再度 redaction** を通す（FR-125 の `redactAiErrorMessage` を使用）
  - `ADMIN_NOTIFY_EMAIL` は環境変数のみで保持、コードにハードコードしない

- [ ] **NFR-126-02: パフォーマンス**
  - AdminLayout のバナー判定 polling は 30 秒間隔、`count: 'exact', head: true` で軽量化
  - ヘルスチェックの Gemini 呼び出しは `maxOutputTokens: 1` で最小コスト（推定 < ¥0.01/回）

- [ ] **NFR-126-03: 後方互換性**
  - 既存の `ai_call_logs.error_kind` が `gemini_api` の過去レコードは正規表現で再分類しない（過去ログは触らない）
  - `AdminLayout` のバナーは「直近 1 時間」のみ見るので、過去レコードは影響なし

### データモデル変更

```sql
-- supabase/migrations/20260513000001_admin_alerts.sql
CREATE TABLE IF NOT EXISTS public.admin_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type text NOT NULL CHECK (alert_type IN ('gemini_key_failure')),
  triggered_at timestamptz NOT NULL DEFAULT now(),
  notified_at timestamptz,
  metadata jsonb,
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_admin_alerts_type_triggered
  ON public.admin_alerts (alert_type, triggered_at DESC);

ALTER TABLE public.admin_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_select_alerts" ON public.admin_alerts
  FOR SELECT TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
```
