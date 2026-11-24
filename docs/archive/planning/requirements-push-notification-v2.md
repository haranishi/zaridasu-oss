> ⚠️ **アーカイブ（2026-07-18 / REQ-282 FR-282-B4）**: 歴史的文書（当時のスナップショット）。以後更新しない。現況は `docs/requirements/` の REQ 文書とインデックスを参照。

# 要件定義: API-005v2 Web Push 通知（拡張版）

- **ID**: API-005v2
- **優先度**: 🔴 高（リピート率・エンゲージメントに直結）
- **使用API**: Web Push API（VAPID 認証）+ Supabase Database Webhook + Edge Function
- **作成日**: 2026-03-20
- **元ドキュメント**: `requirements-api-push-notification.md`（API-005）を拡張

---

## これは何か

API-005（Web Push 通知）を UX フロー・エラーハンドリング・アクセシビリティまで含めて拡張した要件定義書。長いため機能要件 F1〜F6 の境界で分割し、本文は `requirements-push-notification-v2/` 配下へ逐語で移した。

## 目的・背景の要約

PWA 対応済みだが Push 通知が未実装で、新しい目撃情報を能動的に伝える手段がなかった。元の API-005 は UX フロー・エラーハンドリング・アクセシビリティの詳細が不足し、iOS の制約（16.4+・ホーム画面追加必須）への対応設計も不十分だったため、それらを補って再定義したもの。

## 主要な決定事項（要点）

- 構成は **Web Push API（VAPID）+ Supabase Database Webhook → Edge Function `send-push`**。FCM 等の有料サービスは使わず配信は無料。
- 購読情報は `push_subscriptions` テーブルに保存し、**市区町村・種別（species）・情報種別（info_type）でフィルタ**する。自分の投稿では通知しない。
- 頻度制限は **5 分間隔・1 日 20 件上限**。無効エンドポイント（410 Gone）は `is_active = FALSE` に更新。
- 配信はベストエフォート（TTL 86400 秒）。購読者 100 件超はバッチ分割し、Edge Function のタイムアウト 26 秒内に収める。
- 通知ペイロードに個人情報を含めず、公開情報（種別・市区町村）のみとする。トグル UI は `role="switch"` / `aria-checked` / `aria-label` でスクリーンリーダー対応。
- 実装前に VAPID 鍵ペア生成・Supabase シークレット登録・Database Webhook 設定というコード外の準備作業が必要。

## 分割ファイル

- [01-issues-stories-and-f1-ui.md](requirements-push-notification-v2/01-issues-stories-and-f1-ui.md) — 現状の課題、ユーザーストーリー US1〜US5、F1 通知購読 UI（`PushNotificationCard` の状態遷移）
- [02-f2-push-subscriptions-table.md](requirements-push-notification-v2/02-f2-push-subscriptions-table.md) — F2 `push_subscriptions` テーブル定義と RLS
- [03-f3-webhook-and-edge-function.md](requirements-push-notification-v2/03-f3-webhook-and-edge-function.md) — F3 Database Webhook から Edge Function `send-push` への配信処理
- [04-f4-f6-service-worker-rate-limit-hook.md](requirements-push-notification-v2/04-f4-f6-service-worker-rate-limit-hook.md) — F4 Service Worker Push ハンドラー、F5 通知頻度制限、F6 購読管理フック
- [05-nonfunctional-design-and-preparation.md](requirements-push-notification-v2/05-nonfunctional-design-and-preparation.md) — 非機能要件、実装設計（新規・変更ファイル）、実装前の準備作業、テスト観点
- [06-user-flows-and-ux-proposals.md](requirements-push-notification-v2/06-user-flows-and-ux-proposals.md) — 通知購読フロー・通知受信フローと UX 観点の改善提案一覧
