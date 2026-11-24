# Web Push 運用手順書（VAPID 鍵生成・購読・送信）

> 参照要件: REQ-237（FR-237-01〜07 / NFR-237-01〜04 / AC-01〜07）
> 関連: REQ-234（メールのライフサイクル通知＝相補チャネル）、REQ-211（VAPID 秘密鍵の管理）、REQ-218（配信の暴走防止）、REQ-131（webhook 共有秘密）
> 所要時間: 初回セットアップ **30 分以内** + 対応ブラウザでの実送信検証

---

## これは何か

ブラウザのプッシュ通知（Web Push）を運用するための手順書。VAPID 鍵ペアの生成、環境変数の配置、
Edge Function と DB マイグレーションのデプロイ、対応ブラウザでの実送信検証、失効購読の扱い、
リリース前のセキュリティ確認までを扱う。

## 目的・背景

メールだけでは即時性と再訪率が足りないため、同一イベント（投稿承認・コメント・周辺新着）を
Push でも届けられるようにした。Push はメールの置き換えではなく**相補チャネル**で、ユーザーが
Push / メールの双方または片方を選べる（FR-237-06）。

## 主要な決定事項（要点）

- **VAPID 秘密鍵はサーバー専用。** `NEXT_PUBLIC_` にしない・コミットしない・ログに出さない。クライアントに置くのは公開鍵のみ。
- **iOS / Safari はホーム画面に追加した PWA でのみ動く。** 通常タブでは非対応表示にしてメールへ誘導する。これは仕様であり不具合ではない。
- **VAPID 鍵は base64url の raw P-256**（公開鍵 65 byte / 秘密鍵スカラ 32 byte）。`_shared/webpush.ts` がこのフォーマットを前提にしており、実装契約は `webpush.test.ts` が担保する。
- **`_shared/webpush.ts` は依存ゼロ**（Deno の Web Crypto のみ）。`web-push` npm を使わず `supabase/functions/deno.lock` を汚さない。
- **購読カテゴリは明示オプトイン**（`notify_push_*` は既定 false。許諾を取って初めて true）。
- **Service Worker は `npm run build` で自動再生成**され `CACHE_VERSION` が更新される。手動操作は不要。
- 送信時に `410 Gone` / `404` が返った購読は自動で無効化し、30 日後に刈り込める。

## 各部品

- [01-prerequisites-and-architecture.md](./web-push/01-prerequisites-and-architecture.md) — §0 重要な前提（秘密鍵の扱い / iOS 制約 / メールとの相補）、§1 構成（SW・購読フック・設定 UI・DB・送信・起動の層と担当ファイル）。
- [02-vapid-key-generation.md](./web-push/02-vapid-key-generation.md) — §2 VAPID 鍵ペアの生成。方法 A（web-push CLI）/ 方法 B（openssl + base64url 変換）と、鍵フォーマットの確認テストの実行方法。
- [03-env-and-deploy.md](./web-push/03-env-and-deploy.md) — §3 環境変数の設定（クライアント / Edge Secrets の変数表と注意）、§4 デプロイ（Edge Function・マイグレーション・SW 再生成）。
- [04-verification.md](./web-push/04-verification.md) — §5 動作確認（対応ブラウザ、トグル ON からテスト送信・クリック遷移・OFF まで）と失効購読の確認（AC-06）。
- [05-troubleshooting-and-security-checklist.md](./web-push/05-troubleshooting-and-security-checklist.md) — §6 トラブルシュート（症状 / 原因・対処）、§7 リリース前セキュリティ・チェックリスト。
