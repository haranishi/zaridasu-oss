# REQ-088: 調査依頼の通知機能（Phase 4）

> **位置づけ**: REQ-084 Phase 4 / 親ドキュメント REQ-084 を参照
> **作成日**: 2026-04-25
> **ステータス**: TODO（実装未着手）
> **関連要件**: REQ-084（親）/ REQ-086（status 遷移）/ REQ-087（応答）/ REQ-089（コメント直結）/ REQ-073（DB Webhook 起動パターン）
> **優先度**: P2（コミュニティ循環の駆動力）

---

## これは何か

調査依頼に関するメール通知（Resend + Edge Function + pg_net Webhook）を新規導入する要件。通知は現状 **一切存在しない**。
本文は全文を下の部品ファイルへ逐語で移動してある（この入口の要約部分のみ新規記述）。

## 目的・背景の要約

新規依頼が立っても近隣ユーザーには気づかれず、応答や結果投稿があっても依頼者はアプリを開かないと分からない。依頼ループに「外からの呼び込み」を加えるのが目的。通知トリガーは 5 種（新規依頼 INSERT / 結果投稿 open→responded / 応答 INSERT / クローズ / コメント）。

## 主要な決定事項の要点

- **メールのみ。スマホ push 通知（PWA / web push）はスコープ外**（別要件）。アプリ内通知センター、SNS・Slack 連携も対象外。初期は日本語のみ。
- 送信基盤は **Resend**（既存 `RESEND_API_KEY` を流用、要確認）。起動は既存 `analyze-image` と同じ **pg_net + Edge Function パターン**（REQ-073 と同等）を踏襲。
- **即時とダイジェストを使い分ける** — 新規依頼・結果投稿・クローズは即時（30 秒以内）、応答通知は**1 日 1 回のバッチで 24h 集約**（深夜 JST 03:00 想定）。
- opt-out は **`user_profiles` に `notify_survey_request` / `notify_response_digest` を追加**（既定 TRUE）。メール末尾の JWT トークン付き unsubscribe リンク（TTL 30 日）と設定画面の両方から停止できる。
- **メール本文に生座標を含めない**（市区町村粒度まで）。含めるのは display_name まで。
- **フェイルオープン** — Resend 失敗時は `audit_logs` に記録するだけで、依頼作成／応答自体は成功させる。同一 event_id の 5 分以内の再受信は無視して重複送信を防ぐ。
- スパム対策として **1 ユーザーあたり 1 日 5 通のキャップ**。一斉送信は BCC ではなく個別送信（個人情報配慮）。
- ロールアウトは `NOTIFY_SURVEY_REQUEST_ENABLED` フラグで段階的に。
- 合計工数は **L（2〜3 日）**。

## 部品ファイル

| ファイル | 内容 |
|---|---|
| [01-overview.md](REQ-088-survey-request-notifications/01-overview.md) | 要件概要 — 背景・目的、通知トリガー一覧（5 種の対応表）、スコープ、前提条件・制約 |
| [02-user-stories.md](REQ-088-survey-request-notifications/02-user-stories.md) | ユーザーストーリー US-088-01〜04（新規依頼の気づき、結果投稿の気づき、通知停止、ダイジェスト） |
| [03-functional-requirements.md](REQ-088-survey-request-notifications/03-functional-requirements.md) | 機能要件 FR-088-01〜07 — カラム追加 DDL、Edge Function、各通知のトリガーと対象抽出 SQL、opt-out |
| [04-non-functional-requirements.md](REQ-088-survey-request-notifications/04-non-functional-requirements.md) | 非機能要件 — パフォーマンス、セキュリティ、信頼性、コスト（Resend Free tier 3000 通/月） |
| [05-impact-and-acceptance.md](REQ-088-survey-request-notifications/05-impact-and-acceptance.md) | 影響範囲（コード変更、環境変数 4 種、DB・マイグレーション）と受け入れ基準 AC-088-01〜09 |
| [06-risks-plan-summary.md](REQ-088-survey-request-notifications/06-risks-plan-summary.md) | リスク・トレードオフ、実装優先度と計画、サマリーと次のアクション |
