#### F2: Supabase 型定義の自動生成（Phase 1 - 即時）

```bash
# Supabase CLI でスキーマから型を自動生成
npx supabase gen types typescript --project-id YOUR_PROJECT_ID > src/types/database.types.ts
```

生成される型の例:

```typescript
// src/types/database.types.ts（自動生成）
export type Database = {
  public: {
    Tables: {
      posts: {
        Row: {
          id: string
          created_at: string
          lat: number
          lng: number
          species: 'american' | 'bullfrog'
          info_type: 'sighting' | 'capture' | 'trace' | 'damage'
          municipality: string | null
          comment: string | null
          photos: string[] | null
          user_id: string | null
          is_anonymous: boolean
          is_official: boolean
          count: number | null
          observed_at: string | null
          updated_at: string
        }
        Insert: { ... }
        Update: { ... }
      }
      comments: { ... }
      likes: { ... }
      reports: { ... }
    }
  }
}
```

**注意**: Supabase スキーマ変更のたびに再生成が必要。npm スクリプトに追加推奨:

```json
{
  "scripts": {
    "db:types": "supabase gen types typescript --project-id $SUPABASE_PROJECT_ID > src/types/database.types.ts"
  }
}
```

---
