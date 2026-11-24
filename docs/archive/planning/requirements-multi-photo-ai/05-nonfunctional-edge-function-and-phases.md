## 非機能要件

| 項目 | 要件 |
|------|------|
| パフォーマンス | 3枚並列処理で応答時間 < 15秒（1枚あたり約5秒）。`Promise.allSettled` で失敗した写真があっても他は処理続行 |
| コスト | Gemini API 呼び出し: 最大3回/投稿。月間投稿100件想定で月300回（無料枠内） |
| 耐障害性 | 1枚でも成功すれば結果を返す。全失敗時のみエラー |
| 後方互換性 | `ai_result` のトップレベルキーは変更なし。既存フロントエンドは修正不要で動作 |
| タイムアウト | 全体タイムアウト: 45秒（3枚 × 15秒）。個別タイムアウト: 30秒/枚 |

---

## Edge Function 変更箇所

### 変更1: `analyzeWithGemini` → 複数枚対応

```typescript
// 変更前 (L148)
const imageUrl: string = record.photos[0]

// 変更後
const photos: string[] = record.photos.slice(0, 3) // 最大3枚

const results = await Promise.allSettled(
  photos.map(url => analyzeWithGemini(url, claimedSpecies))
)

const photoResults = results.map((r, i) =>
  r.status === 'fulfilled' ? r.value : { error: String(r.reason) }
)

const aiResult = aggregateResults(photoResults)
```

### 変更2: aggregate 関数を追加

上記 F1 の `aggregateResults` 関数を Edge Function 内に追加。

### 変更3: ログ出力の更新

```typescript
console.log(
  `[analyze-image] post ${record.id} → ${photos.length} photos, ` +
  `species_match=${aiResult.species_match}, confidence=${aiResult.confidence}, ` +
  `auto_approved=${shouldAutoApprove}, reanalysis=${reanalysis}`
)
```

---

## 画面遷移（変更なし）

既存の画面遷移に影響なし。DetailPage と AdminPostsPage の AI 判定表示エリアが拡張されるのみ。

---

## 実装フェーズ

| フェーズ | 内容 | 優先度 |
|---------|------|-------|
| Phase A | Edge Function: 複数枚並列解析 + aggregate ロジック | 高 |
| Phase B | ai_result に `per_photo` を追加（DB変更なし、JSONB内の構造変更のみ） | 高 |
| Phase C | DetailPage: 写真別AI判定結果の表示 | 中 |
| Phase D | AdminPostsPage: 審査画面での複数枚判定表示 | 中 |
| Phase E | 再分析フロー対応確認 + テスト | 低 |

---

## 依存・注意事項

- **Gemini API 料金**: 1投稿あたり最大3回呼び出し。`gemini-3.1-flash-lite-preview` は低コストモデルだが、投稿数が増えた場合はモニタリング必要
- **Edge Function のメモリ**: 3枚分の base64 画像を同時に保持するため、最大 ~15MB（5MB × 3）のメモリ使用。Supabase Edge Functions のメモリ制限（150MB）内に収まる
- **既存データとの互換**: 移行前の投稿は `per_photo` フィールドがない。フロントエンドは `per_photo` が undefined の場合にフォールバック表示が必要
- **`Promise.allSettled` 使用**: 1枚の失敗が他に影響しないよう `Promise.all` ではなく `Promise.allSettled` を使用
- **自動承認判定**: 統合結果のトップレベル値で判定するため、既存の自動承認ロジック（L173-180）は変更不要
- **GAME-001（バッジ）との連携**: `ai_perfect` バッジの判定は統合後の confidence を使用。per_photo の最高値ではなく統合値で判定
