## API / データモデル仕様

### ファイル冒頭の設定定数
```ts
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? ''
const GEMINI_MODEL = 'gemini-3.1-flash-lite-preview'
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`
const SPECIES_LABELS: Record<string, string> = {
  american: 'アメリカザリガニ',
  bullfrog: 'ウシガエル',
}
const AUDIO_FETCH_TIMEOUT_MS = 10_000
const GEMINI_TIMEOUT_MS = 30_000
```

### 出力される `ai_result.audio_analysis` 形式
```json
{
  "detected_species": "bullfrog",
  "species_match": true,
  "confidence": 0.92,
  "audio_quality": "good",
  "is_appropriate": true,
  "concerns": [],
  "notes": "ウシガエル特有の低い鳴き声を確認",
  "model": "gemini-3.1-flash-lite-preview",
  "analyzed_at": "2026-04-21T12:00:02Z"
}
```

### Supabase Dashboard での設定手順（ファイル冒頭コメントに記載）
```
Database → Webhooks → "Create a new hook"
  - Name: analyze-audio-on-insert
  - Table: posts
  - Events: INSERT, UPDATE
  - Type: Supabase Edge Functions
  - Edge Function: analyze-audio
  - Condition (optional): NEW.audio_url IS NOT NULL
```

