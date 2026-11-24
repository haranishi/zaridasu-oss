## API / データモデル仕様

### SQL マイグレーション（`supabase/schema.sql` への追記）
```sql
-- ===================================================
-- N. 音声投稿カラム — REQ-071
-- ===================================================
ALTER TABLE posts ADD COLUMN IF NOT EXISTS audio_url TEXT;

ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_audio_url_length;
ALTER TABLE posts ADD CONSTRAINT posts_audio_url_length
  CHECK (audio_url IS NULL OR char_length(audio_url) <= 500);

ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_audio_url_format;
ALTER TABLE posts ADD CONSTRAINT posts_audio_url_format
  CHECK (audio_url IS NULL OR audio_url ~ '^https?://');

CREATE INDEX IF NOT EXISTS idx_posts_has_audio ON posts ((audio_url IS NOT NULL))
  WHERE audio_url IS NOT NULL;

COMMENT ON COLUMN posts.audio_url IS 'Supabase Storage (post-audio) の publicUrl。鳴き声投稿時に使用。NULL=音声なし。';
```

### TypeScript 型（`src/types/index.ts`）
```ts
export interface ImageAiAnalysis {
  detected_species?: string
  species_match?: boolean | null
  confidence?: number | null
  image_quality?: 'good' | 'acceptable' | 'poor'
  is_appropriate?: boolean
  concerns?: string[]
  notes?: string | null
  analyzed_at?: string
  photo_count?: number
  analyzed_count?: number
  per_photo?: Array<{ photo_index: number; [k: string]: unknown }>
  error?: string
}

export interface AudioAiAnalysis {
  detected_species?: string
  species_match?: boolean | null
  confidence?: number | null
  audio_quality?: 'good' | 'acceptable' | 'poor'
  is_appropriate?: boolean
  concerns?: string[]
  notes?: string | null
  analyzed_at?: string
  error?: string
}

export interface CombinedDecision {
  should_approve: boolean
  should_reject: boolean
  reason: string
}

export interface AiResult {
  image_analysis?: ImageAiAnalysis
  audio_analysis?: AudioAiAnalysis
  combined_decision?: CombinedDecision
  model?: string
  analyzed_at?: string
  // 後方互換: 旧 analyze-image が書いたトップレベルフィールド
  detected_species?: string
  species_match?: boolean | null
  confidence?: number | null
}

export interface Post {
  // ... 既存フィールド ...
  audio_url: string | null
  ai_result: AiResult | null
}
```
