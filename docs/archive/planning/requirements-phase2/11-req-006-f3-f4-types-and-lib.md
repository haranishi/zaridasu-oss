#### F3: アプリケーション共通型の定義（Phase 2 - 1週間以内）

`src/types/index.ts` にアプリ固有の型を定義する。

```typescript
// src/types/index.ts
import type { Database } from './database.types'

// DB テーブルの Row 型を再エクスポート
export type Post = Database['public']['Tables']['posts']['Row']
export type Comment = Database['public']['Tables']['comments']['Row']
export type Like = Database['public']['Tables']['likes']['Row']
export type Report = Database['public']['Tables']['reports']['Row']

// 種類・情報種別の型（constants.js の値から導出）
export type Species = 'american' | 'bullfrog'
export type InfoType = 'sighting' | 'capture' | 'trace' | 'damage'

// フィルタの型
export interface PostFilter {
  period: '7' | '30' | '90' | '0'
  municipality: string
  species: Species | ''
  infoType: InfoType | ''
  search: string
  sort: 'newest' | 'oldest'
}

// 地図座標の型
export interface LatLng {
  lat: number
  lng: number
}

// フォーム入力の型
export interface PostFormData {
  position: LatLng | null
  species: Species
  infoType: InfoType
  municipality: string
  comment: string
  count: string
  observedAt: string
}

// アップロード進捗の型
export interface UploadProgress {
  current: number
  total: number
}
```

---

#### F4: lib/ ファイルの .ts 変換（Phase 2 - 1週間以内）

**変換対象と優先度**:

| ファイル | 変換後 | 理由 |
|---------|--------|------|
| `src/lib/supabase.js` | `supabase.ts` | 型付き Supabase クライアントの基盤 |
| `src/lib/constants.js` | `constants.ts` | `Species`, `InfoType` 型を利用 |
| `src/utils/errorHandler.js` | `errorHandler.ts` | 引数・戻り値の型を明示 |
| `src/utils/storage.js` | `storage.ts` | パス操作の型安全化 |

##### supabase.ts の変換例

```typescript
// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database.types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)
// ↑ Database 型を渡すことで、.from('posts').select() の戻り値が Post[] 型になる
```

##### errorHandler.ts の変換例

```typescript
// src/utils/errorHandler.ts
export function getErrorMessage(err: unknown): string {
  if (!err) return '予期しないエラーが発生しました。'
  // ...
}

export function logError(err: unknown, context = ''): void {
  if (import.meta.env.DEV) {
    console.error(`[${context}]`, err)
  }
}
```

---
