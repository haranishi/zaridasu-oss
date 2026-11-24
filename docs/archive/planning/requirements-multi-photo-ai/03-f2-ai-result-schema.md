### F2: ai_result スキーマ拡張

**現在の `ai_result` JSONB 構造**:

```json
{
  "detected_species": "american",
  "species_match": true,
  "confidence": 0.87,
  "image_quality": "good",
  "is_appropriate": true,
  "concerns": [],
  "notes": "...",
  "model": "gemini-3.1-flash-lite-preview",
  "analyzed_at": "2026-03-20T..."
}
```

**拡張後の `ai_result` JSONB 構造**:

```json
{
  "detected_species": "american",
  "species_match": true,
  "confidence": 0.91,
  "image_quality": "good",
  "is_appropriate": true,
  "concerns": [],
  "notes": "アメリカザリガニと確認できます",
  "model": "gemini-3.1-flash-lite-preview",
  "analyzed_at": "2026-03-20T...",
  "photo_count": 3,
  "analyzed_count": 3,
  "per_photo": [
    {
      "photo_index": 0,
      "detected_species": "american",
      "species_match": true,
      "confidence": 0.87,
      "image_quality": "good"
    },
    {
      "photo_index": 1,
      "detected_species": "american",
      "species_match": true,
      "confidence": 0.95,
      "image_quality": "good"
    },
    {
      "photo_index": 2,
      "detected_species": "american",
      "species_match": true,
      "confidence": 0.82,
      "image_quality": "acceptable"
    }
  ]
}
```

**後方互換性**: トップレベルのキーは変更なし。既存のフロントエンドコードは `ai_result.confidence` 等をそのまま参照でき、壊れない。`per_photo` と `photo_count` は新規追加フィールド。
