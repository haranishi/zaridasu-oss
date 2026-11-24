## 5. 動作確認（対応ブラウザ）

対応ブラウザ = デスクトップ Chrome/Edge/Firefox、Android Chrome、**iOS はホーム追加 PWA のみ**。

1. ログインし、マイページ → プロフィール編集モーダルを開く。
2. 「Web Push」トグルを ON → ブラウザの許諾ダイアログで許可。
   - DB の `push_subscriptions` に `enabled=true` の行が 1 件入る（AC-01）。
   - `user_profiles.notify_push_*` が true になる。
3. テスト送信（service-role の SQL コンソール or Edge を直接叩く）:
   ```sql
   -- pg_net 経由（本番のみ・Vault 設定済みなら）
   select public.call_send_push(jsonb_build_object(
     'user_id', '<自分のuuid>',
     'category', 'post_status',
     'notification', jsonb_build_object('title','テスト','body','届きましたか？','url','/dashboard')
   ));
   ```
   または `send-push` Edge を curl（`Authorization: Bearer <service-role>` と
   `x-webhook-secret`、body に上記 JSON）で叩く。通知が表示されれば OK（AC-01）。
4. 通知をクリック → 該当ページ（`url`）が開く / 既存タブにフォーカスする（AC-02）。
5. トグルを OFF → 購読が解除され DB 行が削除、opt-in が false に戻る。

### 失効購読の確認（AC-06）

push service が `410 Gone` / `404` を返すと、`send-push` が `deactivate_push_subscription(endpoint)`
を呼び `enabled=false` + `last_failed_at` をセットする。以降の送信対象から外れる。
無効化から 30 日経過した行は `prune_disabled_push_subscriptions()` で物理削除できる
（任意で pg_cron に登録）。

---
