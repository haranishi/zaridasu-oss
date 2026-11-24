### F1: 複数枚解析ロジック（Edge Function）

**現在**: `photos[0]` のみ → Gemini API 1回

**変更後**: `photos` 全件（最大3枚） → Gemini API を並列呼び出し → 結果を統合

```
[photos[0]] ──→ Gemini API ──→ result_0
[photos[1]] ──→ Gemini API ──→ result_1  → aggregate() → final_result
[photos[2]] ──→ Gemini API ──→ result_2
```

**統合アルゴリズム（aggregate）**:

```typescript
function aggregateResults(results: AiResult[]): AggregatedResult {
  // 有効な結果のみ（エラーを除外）
  const valid = results.filter(r => !r.error)
  if (valid.length === 0) return { error: 'All analyses failed' }

  // 1. confidence が最高の結果をプライマリとする
  const primary = valid.reduce((a, b) =>
    (a.confidence ?? 0) > (b.confidence ?? 0) ? a : b
  )

  // 2. species_match: 過半数の結果を採用（多数決）
  const matchVotes = valid.filter(r => r.species_match === true).length
  const mismatchVotes = valid.filter(r => r.species_match === false).length
  const species_match = matchVotes > mismatchVotes ? true
    : mismatchVotes > matchVotes ? false : null

  // 3. confidence: 有効結果の加重平均（画質goodは重み2、それ以外は重み1）
  const weighted = valid.map(r => ({
    conf: r.confidence ?? 0,
    weight: r.image_quality === 'good' ? 2 : 1,
  }))
  const totalWeight = weighted.reduce((s, w) => s + w.weight, 0)
  const confidence = weighted.reduce((s, w) => s + w.conf * w.weight, 0) / totalWeight

  // 4. is_appropriate: 1枚でも不適切ならfalse
  const is_appropriate = valid.every(r => r.is_appropriate !== false)

  // 5. image_quality: 最良の画質を採用
  const qualityOrder = { good: 3, acceptable: 2, poor: 1 }
  const best_quality = valid.reduce((a, b) =>
    (qualityOrder[a.image_quality] ?? 0) >= (qualityOrder[b.image_quality] ?? 0) ? a : b
  ).image_quality

  // 6. concerns: 全結果のユニオン
  const concerns = [...new Set(valid.flatMap(r => r.concerns ?? []))]

  return {
    detected_species: primary.detected_species,
    species_match,
    confidence: Math.round(confidence * 100) / 100,
    image_quality: best_quality,
    is_appropriate,
    concerns,
    notes: primary.notes,
    photo_count: results.length,
    analyzed_count: valid.length,
    per_photo: results.map((r, i) => ({
      photo_index: i,
      ...(r.error ? { error: r.error } : {
        detected_species: r.detected_species,
        species_match: r.species_match,
        confidence: r.confidence,
        image_quality: r.image_quality,
      }),
    })),
  }
}
```
