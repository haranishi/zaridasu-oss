#### B. responseSchema による出力構造強制

- [ ] **FR-130-04: analyze-image に responseSchema を追加**
  `analyze-image/index.ts` の `generationConfig` に:
  ```ts
  responseMimeType: 'application/json',
  responseSchema: IMAGE_RESPONSE_SCHEMA,  // 後述
  ```
  
  `IMAGE_RESPONSE_SCHEMA` (定数として module 上部に定義):
  ```ts
  const IMAGE_RESPONSE_SCHEMA = {
    type: 'object',
    properties: {
      detected_species: { type: 'string', enum: ['american', 'bullfrog', 'other', 'unclear'] },
      species_match: { type: ['boolean', 'null'] },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      image_quality: { type: 'string', enum: ['good', 'acceptable', 'poor'] },
      is_appropriate: { type: 'boolean' },
      concerns: { type: 'array', items: { type: 'string' } },
      notes: { type: 'string', maxLength: 100 }, // 念のため長めに
    },
    required: ['detected_species', 'species_match', 'confidence', 'image_quality', 'is_appropriate'],
  }
  ```

- [ ] **FR-130-05: analyze-audio に responseSchema を追加**
  同様に `AUDIO_RESPONSE_SCHEMA` を定義し `generationConfig.responseSchema` に渡す。フィールドは音声判定用に。
