### F4: Service Worker Push ハンドラー

```javascript
// vite-plugin-pwa の injectManifest or カスタム SW に追加
self.addEventListener('push', (event) => {
  if (!event.data) return
  const data = event.data.json()
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || '/icon-192.svg',
      badge: data.badge || '/icon-192.svg',
      data: data.data,
      tag: data.tag,
      renotify: data.renotify ?? false,
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // 既に開いているタブがあればフォーカス
      for (const client of windowClients) {
        if (client.url.includes(url) && 'focus' in client) {
          return client.focus()
        }
      }
      // なければ新しいタブで開く
      return clients.openWindow(url)
    })
  )
})
```

### F5: 通知頻度制限

- 同一ユーザーへの通知間隔: **最低 5 分**（`last_sent_at` で判定）
- 5 分以内に複数投稿があった場合: まとめ通知「新しい投稿が N 件あります」
- 1 日の通知上限: **20 件**（超過分は翌日に持ち越さない = 破棄）

### F6: 購読管理フック

```typescript
// src/hooks/usePushSubscription.ts
interface UsePushSubscriptionResult {
  isSupported: boolean        // ブラウザ対応 + iOS 条件クリア
  isSubscribed: boolean       // 現在購読中か
  subscription: PushSubscription | null
  filters: PushFilters        // 現在のフィルタ設定
  subscribe: () => Promise<void>
  unsubscribe: () => Promise<void>
  updateFilters: (filters: PushFilters) => Promise<void>
  permissionState: 'prompt' | 'granted' | 'denied'
  loading: boolean
  error: string | null
}
```

---
