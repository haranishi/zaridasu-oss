### 非機能要件

- [ ] **NFR-125-01: 後方互換性**
  既存の `ai_result` 形式 (error_kind なし) を持つ過去投稿でも `ReviewCardAI.tsx` が壊れないこと。`error_kind` が undefined の場合は「AI判定失敗（詳細不明）」へフォールバック。

- [ ] **NFR-125-02: パフォーマンス**
  `ai_call_logs` の最新エラー取得は `posts` の SELECT に N+1 を発生させないため、Postgres view `posts_with_latest_ai_error` を新設するか、`posts.ai_result` に最低限のエラー詳細（`error_message_truncated`）も同時保存して JOIN 不要にする。**実装としては後者（ai_result に冗長コピー）を推奨**。

- [ ] **NFR-125-03: セキュリティ**
  `error_message` に Gemini API キーや認証ヘッダー値が混入しないよう、Edge Function 側で保存前に `key=[A-Za-z0-9_-]+` を `key=[REDACTED]` に置換する。テストで verify する（FR-125-08）。

### データモデル変更

```sql
-- supabase/migrations/20260512000001_ai_failure_tracking.sql
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS ai_failure_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_posts_ai_failure_count
  ON public.posts (ai_failure_count)
  WHERE ai_failure_count >= 3;
```

`ai_result` スキーマ（型のみ。実 DB は JSONB なので migration 不要）:

```ts
// src/types/post.ts
export type AIErrorKind = 'image_fetch' | 'gemini_api' | 'json_parse' | 'unknown'

export interface AIResult {
  // ...既存...
  error?: string
  error_kind?: AIErrorKind        // 追加
  error_message_truncated?: string // 追加（NFR-125-02 のため）
}
```
