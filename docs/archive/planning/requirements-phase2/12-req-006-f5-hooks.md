#### F5: hooks の .ts 変換（Phase 3 - 2週間以内）

**変換対象と型定義**:

##### useReverseGeocode.ts

```typescript
import type { LatLng } from '../types'

type GeocodeError = '' | 'offline' | 'timeout' | 'market'

interface UseReverseGeocodeResult {
  municipality: string
  geocoding: boolean
  geocodeError: GeocodeError
  retry: () => void
}

export function useReverseGeocode(position: LatLng | null): UseReverseGeocodeResult
```

##### useDeletePost.ts

```typescript
import type { Post } from '../types'

interface UseDeletePostOptions {
  onDeleted?: () => void
}

interface UseDeletePostResult {
  deleting: boolean
  error: string
  handleDelete: () => Promise<void>
}

export function useDeletePost(post: Post | null, options?: UseDeletePostOptions): UseDeletePostResult
```

##### usePostForm.ts

```typescript
import type { PostFormData, UploadProgress } from '../types'

interface UsePostFormResult {
  currentUser: User | null
  photos: File[]
  photoPreviews: string[]
  loading: boolean
  error: string
  uploadProgress: UploadProgress | null
  setError: (error: string) => void
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  removePhoto: (index: number) => void
  submitPost: (data: PostFormData) => Promise<boolean>
}
```

---
