## 影響範囲（全 Phase 集約）

### コード変更想定
| ファイル | Phase | 変更内容 |
|---|---|---|
| `supabase/functions/analyze-audio/index.ts` | 1, 3, 4 | モデル切替, Context Caching, hash dedup |
| `supabase/functions/analyze-image/index.ts` | 1, 3, 4 | モデル安定化, Context Caching, hash dedup |
| `src/components/features/posts/AudioRecorder.tsx` | 2 | 無音/低音量/秒数ゲート, 圧縮処理 |
| `src/components/features/posts/PostForm.tsx` | 2 | 画像アップロード前のリサイズ・blur チェック |
| `src/lib/uploadAudio.ts` | 2 | 圧縮後音声のアップロード対応 |
| `src/hooks/usePostForm.ts` | 2, 4 | hash 計算と posts insert 時の付与 |
| `supabase/schema.sql` | 4 | `audio_hash`, `image_hash` カラム追加 |
| `supabase/migrations/YYYYMMDD_*.sql`（新規） | 4 | hash カラム + index + RLS |
| `tests/fixtures/audio/*` `tests/fixtures/images/*`（新規） | 0 | ラベル付き評価データセット |
| `scripts/eval-ai-analysis.ts`（新規） | 0 | confusion matrix 出力スクリプト |
| `src/views/admin/AdminAiCostPage.tsx`（新規） | 0 | 管理画面の AI コストダッシュボード |

### 環境変数追加
| 変数名 | 用途 | Phase |
|---|---|---|
| `GEMINI_IMAGE_MODEL` | 画像判定用モデル指定（`analyze-image` でハードコード解消） | 1 |
| `GEMINI_AUDIO_MODEL` | 既存。Phase 1 で `gemini-2.5-flash-lite` 等に切り替え | 1 |
| `GEMINI_CACHE_TTL_SECONDS` | Context Cache の TTL | 3 |
| `AI_REANALYSIS_DAILY_LIMIT` | 1 投稿あたりの再判定回数上限 | 4 |
| `AI_INPUT_COMPRESSION_ENABLED` | クライアント圧縮の段階的ロールアウト用フラグ | 2 |

### DB スキーマ変更
- Phase 4 のみ: `posts.audio_hash text`, `posts.image_hash text`, 対応 index
- 既存 RLS ポリシーは hash カラムを含まないため `REQ-034` 同様の `restrict_user_columns` トリガーへの追記が必要

---
