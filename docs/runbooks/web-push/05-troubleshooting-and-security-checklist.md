## 6. トラブルシュート

| 症状 | 原因 / 対処 |
|---|---|
| トグルが「非対応」表示 | iOS のタブ Safari（ホーム追加 PWA で開く）/ 旧ブラウザ / `NEXT_PUBLIC_VAPID_PUBLIC_KEY` 未設定。`unsupportedReason` を確認 |
| 許諾済みなのに届かない | Edge Secrets の `VAPID_*` 未設定 → `send-push` は `skipped: no_vapid_keys` を返す。Secrets を設定して再 deploy |
| 401 unauthorized（送信時） | `WEBHOOK_SECRET` 設定済みなのに呼び出し側が `x-webhook-secret` を付けていない（REQ-131） |
| 送信は成功だが端末に出ない | OS/ブラウザの通知設定（サイト通知ブロック）。SW が更新されているか（`CACHE_VERSION`）も確認 |
| 一度拒否したら再要求されない | 仕様（FR-237-04 / AC-04）。`localStorage['zaridasu:push:denied']` を消すかブラウザのサイト権限をリセット |

---

## 7. セキュリティ・チェックリスト（リリース前）

- [ ] `VAPID_PRIVATE_KEY` がクライアントバンドルに含まれない（`NEXT_PUBLIC_` でない）。
      `npm run build` 後に成果物を grep して秘密鍵が無いことを確認（AC-05）。
- [ ] `push_subscriptions` は RLS 有効・本人のみ読み書き（service_role は送信時に RLS バイパス）。
- [ ] 送信 RPC（`get_push_subscriptions_for_user` / `deactivate_push_subscription` /
      `prune_disabled_push_subscriptions`）は `anon` / `authenticated` から REVOKE 済み。
- [ ] 通知本文に座標・`reporter_ip`・個人特定情報を載せていない（呼び出し側で市区町村粒度まで / NFR-237-01）。
