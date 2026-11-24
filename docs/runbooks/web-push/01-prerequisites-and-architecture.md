## 0. 重要な前提（読み飛ばし厳禁）

- **VAPID 秘密鍵はサーバー専用。** `VAPID_PRIVATE_KEY` の実値は **絶対に** `NEXT_PUBLIC_` にしない・
  Git にコミットしない・ログに出さない（NFR-237-01 / REQ-211）。クライアントが触ってよいのは
  **公開鍵のみ**（`NEXT_PUBLIC_VAPID_PUBLIC_KEY`）。秘密鍵は Supabase Dashboard → Edge Functions →
  Secrets にのみ置く。
- **iOS / Safari は「ホーム画面に追加した PWA」でのみ Web Push が動く。** 通常のタブ表示の
  Safari では `PushManager` / `Notification` が使えない（NFR-237-02）。未対応環境では設定 UI が
  Push トグルを無効表示にし、メール（REQ-234）へ誘導する。これは仕様であり不具合ではない。
- **メールと相補。** Web Push は即時性・再訪率でメールを補完するもので、メールの置き換えではない。
  同一イベント（投稿承認・コメント・周辺新着）を Push / メールの双方 or 片方でユーザが選べる（FR-237-06）。

---

## 1. 構成（何がどう動くか）

| 層 | ファイル | 役割 |
|---|---|---|
| Service Worker | `public/sw.js.tpl`（→ `scripts/build-sw.mjs` が `public/sw.js` を生成） | `push` 受信 → `showNotification`、`notificationclick` → 該当ページへフォーカス/遷移 |
| 購読フック | `src/hooks/usePushSubscription.ts` | 環境判定・`pushManager.subscribe`・`push_subscriptions` への保存・opt-in 更新 |
| 設定 UI | `src/components/modals/EditProfileModal.tsx` | Push トグル（REQ-234 メールトグルの隣）。非対応はフォールバック文言 |
| DB | `push_subscriptions` テーブル + RLS + RPC（`supabase/schema.sql` / migration `20260615000007`） | 購読の保管（本人のみ RLS）・送信用 RPC・失効無効化・刈り込み |
| 送信 | `supabase/functions/send-push/` + `_shared/webpush.ts` | VAPID + RFC8291 暗号化で push service へ送信。410/404 は購読を無効化 |
| 起動 | `call_send_push(jsonb)`（migration のみ・pg_net ラッパ） | 他処理から `send-push` を fail-soft で起動 |

- `_shared/webpush.ts` は **依存ゼロ**（Deno の Web Crypto のみ）。`web-push` npm を使わないため
  `supabase/functions/deno.lock` を汚さない。
- 購読カテゴリ列は `user_profiles.notify_push_post_status / notify_push_comment / notify_push_nearby`
  （いずれも `boolean NOT NULL DEFAULT false`。許諾を取って初めて true になる明示オプトイン）。

---
