### データモデル / バックフィル

- [ ] **FR-129-07: 汚染データのバックフィル migration**
  `supabase/migrations/20260513000004_clean_image_dedup_audio_bleed.sql` を新設:
  ```sql
  -- 音声なし投稿に過去の audio_analysis が転写された汚染レコードを clean up
  UPDATE public.posts
     SET ai_result = ai_result - 'audio_analysis' - 'combined_decision' - 'model',
         ai_analyzed_at = NULL,
         ai_failure_count = 0
   WHERE audio_url IS NULL
     AND ai_result IS NOT NULL
     AND (ai_result ? 'audio_analysis');

  -- image_analysis も無く、もう判定材料が空っぽになるレコードは ai_result を null にして
  -- 再分析対象 (analyze-image webhook 起動) にする
  UPDATE public.posts
     SET ai_result = NULL
   WHERE ai_result IS NOT NULL
     AND NOT (ai_result ? 'image_analysis')
     AND NOT (ai_result ? 'audio_analysis')
     AND ai_result - 'analyzed_at' - 'photo_count' - 'analyzed_count' - 'dedup_status' = '{}'::jsonb;
  ```
  注: jsonb の `-` 演算子で特定キーを除去できる。マイグレーションは idempotent。

### テスト要件

- [ ] **FR-129-08: aiDedup の単体テスト追加**
  `supabase/functions/_shared/__tests__/aiDedup.test.ts` を新設または既存に追加:
  - mock posts に「audio_analysis のみ持つ過去投稿」を仕込み、`findImageDedup` が `{found: false}` を返すこと
  - 「image_analysis を持つ過去投稿」では `{found: true, analysis: {<image fields only>}}` を返し、`audio_analysis` を含まないこと
  - 「同じ image_hash でも species が違う過去投稿」では `{found: false}` を返すこと

- [ ] **FR-129-09: analyze-image/index.test.ts のケース追加**
  - 「dedup hit + 既存投稿に audio_analysis あり」→ posts.update payload で `audio_analysis` が preserve され、`image_analysis` のみ新規 dedup 値で書き換えられること
  - 「dedup hit + 既存投稿に combined_decision あり」→ `combined_decision` が再評価されて新しい値で上書きされること

- [ ] **FR-129-10: バックフィル migration のスモークテスト (任意)**
  `supabase/tests/test_image_dedup_audio_bleed_cleanup.sql` (pg-tap) を新設し、サンプル汚染データを insert → migration 適用 → クリーンアップ後の状態を assert。

## 受入条件

- [ ] **AC-129-01**: **Given** 音声なし新規投稿 (audio_url=null) で過去のウシガエル投稿と image_hash が一致、**When** `analyze-image` が起動、**Then** posts.ai_result に audio_analysis が**追加されない**。`image_analysis` のみが dedup から書かれる。
- [ ] **AC-129-02**: **Given** 過去投稿が `species: 'bullfrog'`、新規投稿が `species: 'american'` で image_hash 一致、**When** dedup 検索、**Then** `findImageDedup` は `{found: false}` を返し、Gemini で新規判定が走る。
- [ ] **AC-129-03**: **Given** 既存投稿に `audio_analysis: {detected_species: 'bullfrog', ...}` がある、**When** `analyze-image` の dedup hit ブロックを通過、**Then** posts.update 後も `audio_analysis` が保持されている (剥がれない)。
- [ ] **AC-129-04**: **Given** dedup hit 時、**When** `combineDecision` を再評価、**Then** 古い `combined_decision.reason: 'waiting_for_image_analysis'` ではなく、新しい image_analysis + 既存 audio_analysis に基づく reason が入る。
- [ ] **AC-129-05**: **Given** UI で `copied_from_post_id` が posts.species と一致しないコピー元、**When** 管理者が `/admin/posts` を開く、**Then** カードに `⚠️ コピー元と申告種が違います` のような warning が表示される。
- [ ] **AC-129-06**: **Given** バックフィル migration を本番に適用、**When** `select id from posts where audio_url is null and ai_result ? 'audio_analysis'`、**Then** **0 件** になる。
- [ ] **AC-129-07**: **Given** バックフィル後の対象投稿、**When** `analyze-image` Webhook が再度発火、**Then** `analyze-image` の通常パス（dedup miss → Gemini 呼び出し）が走り、`image_analysis` が新規に書かれる。
- [ ] **AC-129-08**: **Given** `findImageDedup` が「画像判定済み」フィルタを持つ、**When** `ai_result` に `image_analysis` も top-level `detected_species` も無いレコード、**Then** dedup 候補から除外される。
