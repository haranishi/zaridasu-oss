## 目的

1. **画像 dedup が音声判定結果を混入させない**ことを保証する
2. **既存の汚染データをクリーンアップ**して、対象投稿を再分析対象に戻す
3. **将来同種のバグを防ぐ**ためのテスト・防御層を追加する

## 要件

### 機能要件

#### A. dedup ロジックの修正

- [ ] **FR-129-01: `findImageDedup` の戻り値を画像判定スコープに限定**
  `supabase/functions/_shared/aiDedup.ts:70` を以下のように変更:
  ```ts
  // 旧: const analysis = exact.ai_result
  // 新: ai_result.image_analysis があればそれを使う。
  //     旧形式 (image_analysis フィールドが無くトップレベルに detected_species 等を持つ
  //     形) の場合は image 関連フィールドのみ抽出して返す。
  const aiResult = exact.ai_result as Record<string, unknown> | undefined
  if (!aiResult) return { found: false }
  
  const imageAnalysis = (aiResult.image_analysis as Record<string, unknown> | undefined)
    ?? pickImageFields(aiResult) // detected_species/species_match/confidence/image_quality/
                                  // is_appropriate/concerns/notes/per_photo/photo_count/
                                  // analyzed_count のみを抽出するヘルパー
  if (!imageAnalysis || isEmptyImageAnalysis(imageAnalysis)) return { found: false }
  return { found: true, analysis: imageAnalysis, sourcePostId: exact.id }
  ```
  `pickImageFields` と `isEmptyImageAnalysis` は同ファイル内に private helper として実装。

- [ ] **FR-129-02: 「画像判定済み」フィルタの追加**
  `findImageDedup` のクエリに以下の OR 条件を追加:
  ```ts
  .or('ai_result->image_analysis.not.is.null,ai_result->detected_species.not.is.null')
  ```
  → 旧形式 (top-level detected_species) と新形式 (nested image_analysis) のどちらかが入っているレコードのみ採用。

- [ ] **FR-129-03: `species` 一致条件の追加（防御層）**
  `findImageDedup` のクエリで、引数に `claimedSpecies` を追加し:
  ```ts
  // 同じ画像でも申告種が異なれば dedup しない（防御層）
  .eq('species', claimedSpecies)
  ```
  呼び出し側 `analyze-image/index.ts:481-485` は `record.species` を渡すよう変更。
