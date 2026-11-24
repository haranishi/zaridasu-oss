#### B. analyze-image の書き戻しを画像スコープに限定

- [ ] **FR-129-04: dedup hit 時の ai_result 構築を `image_analysis` フィールドに限定**
  `supabase/functions/analyze-image/index.ts:486-495` のブロックを以下に変更:
  ```ts
  if (dedup.found) {
    // 既存 ai_result の audio_analysis / combined_decision は保持し、
    // image_analysis のみ dedup から取得したもので上書きする。
    const existing = (record.ai_result ?? {}) as Record<string, unknown>
    dedupedAiResult = {
      ...existing,
      image_analysis: {
        ...(dedup.analysis as Record<string, unknown>),
        analyzed_at: new Date().toISOString(),
        copied_from_post_id: dedup.sourcePostId,
        dedup_status: 'hit',
      },
      // analyzed_at はトップレベルも更新 (UI の最終分析時刻表示用)
      analyzed_at: new Date().toISOString(),
    };
  }
  ```

- [ ] **FR-129-05: 統合判定 (combined_decision) の再評価**
  dedup hit 後も `combineDecision` を必ず呼んで、現在の `image_analysis` + 既存 `audio_analysis` で再判定する。古い `combined_decision` を残さないこと。

#### C. UI の防御層

- [ ] **FR-129-06: `species_match` 表示時の warning アイコン**
  `src/components/features/admin/ReviewCardAI.tsx` の音声/画像判定セクションで、`copied_from_post_id` がある場合は「♻️ 過去判定の流用」と小さく表示。`species_match=true` でもコピー元と現在の投稿の `species` が違う場合は `⚠️` を出す。詳細は折りたたみで `copied_from_post_id` と `analyzed_at` を表示。
