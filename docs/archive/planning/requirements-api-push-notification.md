> ⚠️ **アーカイブ（2026-07-18 / REQ-282 FR-282-B4）**: 歴史的文書（当時のスナップショット）。以後更新しない。現況は `docs/requirements/` の REQ 文書とインデックスを参照。

# 要件定義: API-005 Web Push 通知

- **ID**: API-005
- **優先度**: 🔵 最終フェーズ（最大工数・最後に実装）
- **使用API**: Web Push API（VAPID 認証）+ Supabase Database Webhook
- **作成日**: 2026-03-15

---

## これは何か

新規投稿を条件に合う購読者へ Web Push で通知する構想を 2026-03-15 に検討した当時の要件定義。本ファイルを入口とし、本文は同名ディレクトリ配下の部品に逐語で分割している。

## 目的・背景

出没情報は「自分の地域に出た」「農業被害の報告が出た」といった限定条件で即座に知りたい情報だが、当時は能動的にサイトを見に来なければ気付けなかった。地域住民・農業従事者・研究者それぞれの関心（市区町村／情報種別／種）に絞って push できれば、対処行動や現地調査の機会を逃さない。工数が最大のため最終フェーズに置かれた。

## 主要な決定事項（要点）

- 中間サービスを使わず **VAPID 方式の Web Push（RFC 8030）** を直接叩く。配信自体はブラウザベンダー経由で無料。
- 起動点は Supabase の **Database Webhook**（`posts` の INSERT）→ Edge Function `send-push` を HTTP POST で呼ぶ。
- 購読は `push_subscriptions` テーブルに保存し、絞り込み条件は `filter_conditions` JSONB（市区町村／種／情報種別）で持つ。RLS は `user_id = auth.uid()` のみ CRUD 許可。
- 送信は `Promise.allSettled` で並列、**最大100件/回**。410 Gone が返ったエンドポイントは `is_active = FALSE` に落とす。
- 鍵は公開鍵のみ `constants.js` に定数として置き、秘密鍵と `VAPID_SUBJECT` は Supabase Edge Function シークレットで管理する。
- **iOS は 16.4 以降のみ対応**。それ未満は購読UIをグレーアウトして理由を明示する。
- 配信保証はベストエフォート（`ttl: 86400` で24時間保持）。

## 部品

- [01-user-stories.md](requirements-api-push-notification/01-user-stories.md) — 地域住民・農業従事者・研究者のユーザーストーリー。
- [02-subscription-ui-and-schema.md](requirements-api-push-notification/02-subscription-ui-and-schema.md) — F1 購読UI、F2 通知条件設定、F3 `push_subscriptions` の DDL、F4 Database Webhook。
- [03-edge-function-vapid-and-sw.md](requirements-api-push-notification/03-edge-function-vapid-and-sw.md) — F5 `send-push` Edge Function、F6 VAPID鍵管理、F7 Service Worker の push/notificationclick ハンドラー。
- [04-nonfunctional-and-implementation.md](requirements-api-push-notification/04-nonfunctional-and-implementation.md) — 非機能要件（コスト・配信保証・セキュリティ・iOS制限・スケーラビリティ）と新規/変更ファイル一覧。
- [05-prep-and-test-perspectives.md](requirements-api-push-notification/05-prep-and-test-perspectives.md) — 実装前の準備作業（VAPID鍵生成・シークレット登録・Webhook設定）とテスト観点5点。
