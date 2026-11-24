## 影響範囲

### 変更対象ファイル

| ファイル | 変更内容 |
|---|---|
| `supabase/functions/_shared/aiDedup.ts` | `findImageDedup` 修正 (スコープ限定 + species フィルタ + image_analysis フィルタ)、private helper 追加 |
| `supabase/functions/analyze-image/index.ts` | dedup hit 時の ai_result 構築変更、`record.species` を `findImageDedup` に渡す、`combineDecision` 再評価 |
| `supabase/functions/_shared/__tests__/aiDedup.test.ts` | 新規またはケース追加 (FR-129-08) |
| `supabase/functions/analyze-image/index.test.ts` | ケース追加 (FR-129-09) |
| `supabase/migrations/20260513000004_clean_image_dedup_audio_bleed.sql` | 新規 (FR-129-07) |
| `src/components/features/admin/ReviewCardAI.tsx` | warning アイコン + copied_from_post_id 表示 (FR-129-06) |
| `src/components/features/admin/__tests__/ReviewCardAI.test.tsx` | warning アイコンのテスト追加 |
| `src/types/post.ts` | `AIResult.image_analysis.copied_from_post_id` 型追加 (任意) |

### 他機能への影響

- **REQ-079 (image_hash dedup)**: dedup の動作仕様が変わる。後方互換のため旧形式 (top-level detected_species) も `pickImageFields` で吸収。 dedup ヒット率はやや下がる（species が違うと dedup しないため）が、精度と引き換えで正解
- **REQ-125 (error_kind / ai_failure_count)**: バックフィルで `ai_failure_count` を 0 にリセット。再分析時に正しくカウントされる
- **REQ-126 (gemini_auth banner)**: 影響なし
- **REQ-127 (MAX_TOKENS retry)**: 影響なし
- **本番デプロイ手順**: 
  1. migration `20260513000004` 適用
  2. `analyze-image` Function 再デプロイ
  3. UI の `ReviewCardAI.tsx` 変更を含む Vercel デプロイ
  4. 汚染がクリーンアップされた投稿は Webhook で自然に再分析される

## 優先度

- **緊急度**: **Critical**（実運用で誤判定が現在進行形で発生中。管理者が誤情報を見ている）
- **重要度**: **High**（AI 判定の信頼性に直結。再現性も明確で、放置すると同種事故が増える）
- **理由**: 直接ユーザーが不利益を被るバグ（音声なし投稿が「ウシガエル」と判定される、申告種一致表示が誤る）。実装難易度は中程度だが、確実な fix が必要。Phase 分け推奨:
  - **Phase 1 (P0、即時)**: FR-129-01〜05（コード修正）+ FR-129-07（バックフィル）+ FR-129-08〜09（テスト）→ Edge Function 再デプロイで本番反映
  - **Phase 2 (P1)**: FR-129-06（UI warning）→ Vercel デプロイ
  - **Phase 3 (任意)**: FR-129-10（pg-tap スモーク）
