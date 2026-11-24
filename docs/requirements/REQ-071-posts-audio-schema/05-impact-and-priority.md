## 影響範囲
- 変更: `supabase/schema.sql`（約 15 行追加）
- 変更: `src/types/index.ts`
- 影響を受ける（読み取り側の型調整）:
  - `src/components/features/posts/PostCard.tsx`
  - `src/app/post/[id]/page.tsx`（投稿詳細 — audio_url があれば `<audio>` を描画）
  - 管理ダッシュボードの投稿一覧
- テスト: `src/__tests__/posts-schema.test.ts`（pg-tap または Vitest 統合）

## 優先度
- **緊急度**: High
- **重要度**: High
- **理由**: REQ-072 の Edge Function が書き込むカラム・構造を事前定義しないと、Webhook が動作しても書き込み先が無い。
