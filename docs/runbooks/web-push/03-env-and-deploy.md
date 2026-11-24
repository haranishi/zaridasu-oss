## 3. 環境変数の設定

### クライアント（Vercel / `.env`）

| 変数 | 値 |
|---|---|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | VAPID 公開鍵（base64url） |

### Edge Functions（Supabase Dashboard → Edge Functions → Secrets）

| 変数 | 値 | 注意 |
|---|---|---|
| `VAPID_PUBLIC_KEY` | VAPID 公開鍵（上と同じ値） | |
| `VAPID_PRIVATE_KEY` | VAPID 秘密鍵 | ★サーバー専用・絶対に公開しない |
| `VAPID_SUBJECT` | `mailto:ops@example.com` 等 | push service が問題時に参照 |
| `WEBHOOK_SECRET` | 既存と共用 | 送信元検証（REQ-131）。未設定は grace period |

> 公開鍵は「クライアントとサーバの両方」に同じ値を置く。秘密鍵は **Edge Secrets だけ**。

---

## 4. デプロイ

```bash
# Edge Function（既存の deploy 手順 = docs/runbooks/edge-function-deploy.md に準拠）
supabase functions deploy send-push

# DB マイグレーション（push_subscriptions テーブル・RLS・RPC）
supabase db push   # または対象プロジェクトに 20260615000007_web_push_subscriptions.sql を適用
```

- Service Worker は `npm run build` 時に `scripts/build-sw.mjs` が `public/sw.js` を再生成し、
  `CACHE_VERSION` が新しいコミット SHA に更新される。これにより旧 SW がクリーンに置き換わる
  （既存の `controllerchange` リロードフロー / NFR-237-04）。**手動操作は不要。**

---
