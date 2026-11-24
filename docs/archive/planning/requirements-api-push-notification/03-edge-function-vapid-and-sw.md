**F5: `send-push` Edge Function**

- Database Webhook から受け取った新規投稿データを元に、フィルター条件に一致する `push_subscriptions` を取得
- VAPID 署名付き Web Push プロトコル（RFC 8030）リクエストを各エンドポイントに送信
- 410 Gone 応答のエンドポイントは `is_active = FALSE` に更新
- 並列送信（`Promise.allSettled`）、最大 100 件/回

**F6: VAPID 鍵管理**

- VAPID 鍵ペアを事前生成（`web-push generate-vapid-keys` 等）
- `VAPID_PUBLIC_KEY`: `constants.js` に定数として設置（クライアント公開可）
- `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`: Supabase Edge Function シークレットとして管理

**F7: Service Worker Push ハンドラー**

```javascript
// PWA Service Worker に push イベントハンドラーを追加
self.addEventListener('push', (event) => {
  const data = event.data?.json()
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.svg',
      badge: '/icon-192.svg',
      data: { url: data.url },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(clients.openWindow(event.notification.data.url))
})
```

---
