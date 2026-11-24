### F3: Database Webhook → Edge Function `send-push`

**トリガー条件**: `posts` テーブルの INSERT（status = 'approved'）**および** UPDATE（status が approved に変更された時）

**Edge Function フロー**:

```
[Database Webhook: posts INSERT/UPDATE]
        ↓
[send-push Edge Function]
        ↓
1. 投稿データ取得（municipality, species, info_type）
        ↓
2. フィルタ条件マッチする push_subscriptions を取得
   - filter_municipalities が空 OR 投稿の municipality を含む
   - filter_species が空 OR 投稿の species を含む
   - filter_info_types が空 OR 投稿の info_type を含む
   - is_active = TRUE
   - user_id ≠ 投稿者の user_id（自分の投稿は通知しない）
        ↓
3. バッチ送信（Promise.allSettled、100件/バッチ）
        ↓
4. エラーハンドリング:
   - 410 Gone → is_active = FALSE（エンドポイント無効）
   - 429 Too Many Requests → リトライキューに入れる（指数バックオフ）
   - その他エラー → error_count++、3回連続で is_active = FALSE
        ↓
5. last_sent_at を更新
```

**通知ペイロード**:

```json
{
  "title": "🦞 秋田市で新しい目撃情報",
  "body": "アメリカザリガニの目撃情報が投稿されました",
  "icon": "/icon-192.svg",
  "badge": "/icon-192.svg",
  "data": {
    "url": "/post/{post_id}",
    "post_id": "{post_id}"
  },
  "tag": "new-post-{post_id}",
  "renotify": false
}
```

- `tag` で同じ投稿の重複通知を防止
- タイトルに市区町村名を含めて一目で関連性を判断できるように
