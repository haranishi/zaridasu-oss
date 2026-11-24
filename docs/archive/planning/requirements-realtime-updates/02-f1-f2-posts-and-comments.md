### F1: 投稿リストのリアルタイム更新（HomePage）

**対象チャネル**: `posts` テーブルの `INSERT` / `UPDATE` イベント（`status = 'approved'` のみ）

**動作仕様**:

| イベント | 動作 |
|---------|------|
| 新規投稿が承認された（INSERT で status='approved' or UPDATE で status が 'approved' に変更） | 投稿リスト先頭に追加 + 地図にマーカー追加 + 件数バッジ更新 |
| 既存投稿が更新された（UPDATE: comment, count 等の変更） | リスト内の該当投稿を差し替え |
| 投稿が削除された（DELETE） | リストから除去 + 地図のマーカー除去 |

**UX設計**:
- 新着投稿が入った時、**自動でリスト最上部にスクロールしない**（ユーザーの閲覧を妨げない）
- 代わりに「新しい投稿があります」バナーを表示 → タップでスクロール＆反映
- 地図上のマーカーは即座に追加（視覚的に目立つアニメーション付き）

```
┌──────────────────────────────┐
│ 🔔 新しい投稿が 3 件あります  │  ← タップでリスト更新
│          表示する              │
└──────────────────────────────┘
```

**実装方針**:

```typescript
// src/hooks/useRealtimePosts.ts
import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { Post } from '@/types'

interface UseRealtimePostsOptions {
  onInsert: (post: Post) => void
  onUpdate: (post: Post) => void
  onDelete: (id: string) => void
  enabled?: boolean  // ページがアクティブな時のみ
}

export function useRealtimePosts(options: UseRealtimePostsOptions) {
  useEffect(() => {
    if (!options.enabled) return

    const channel = supabase
      .channel('posts-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'posts',
          filter: 'status=eq.approved',
        },
        (payload) => {
          switch (payload.eventType) {
            case 'INSERT':
              options.onInsert(payload.new as Post)
              break
            case 'UPDATE':
              options.onUpdate(payload.new as Post)
              break
            case 'DELETE':
              options.onDelete(payload.old.id)
              break
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [options.enabled])
}
```

### F2: コメントのリアルタイム更新（DetailPage）

**対象チャネル**: `comments` テーブルの `INSERT` / `DELETE`（`filter: post_id=eq.{postId}`）

**動作仕様**:
- 他ユーザーが同じ投稿にコメントした → コメント一覧末尾に即反映
- コメントが削除された → 一覧から除去
- 自分のコメント送信時は既存フローで即反映済みのため、重複追加しない（`id` で判定）
