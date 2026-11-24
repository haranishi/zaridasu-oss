# REQ-089: 調査依頼へのコメント直結化（Phase 5）

> **位置づけ**: REQ-084 Phase 5 / 親ドキュメント REQ-084 を参照
> **作成日**: 2026-04-25
> **ステータス**: TODO（実装未着手）
> **関連要件**: REQ-084（親）/ REQ-086（結果投稿）/ REQ-087（応答）/ REQ-088（通知）/ REQ-007（spam-check）
> **優先度**: P3（コミュニティの会話分散を解消する仕上げフェーズ）

---

## これは何か

調査依頼（`survey_requests`）に**直接コメントできるスレッド**を追加する要件定義。
REQ-084 ロードマップの最終 Phase 5 にあたる。

## 目的・背景

現状、依頼に対する会話は結果投稿（`posts`）を経由しないと成立しない。そのため
「依頼の意図を確認したい」程度の軽量な質問が置き場を持てず、結果投稿が無いうちは会話が始まらず、
同一依頼に複数の結果投稿があるとコメントが分散する。本要件はこの分散を解消する。

## 主要な決定事項（要点）

- **テーブル設計は案 B（`survey_request_comments` 新設）を採用**。既存 `comments` の polymorphic 化（案 A）は
  RLS / index の大幅改修になりリスクが高い。両者は **view `survey_request_timeline` で統合表示**する。
- コメントは**フラット1階層・テキストのみ・編集不可（削除のみ）**。削除は `deleted_at` を立てる
  **ソフトデリート RPC**（`soft_delete_request_comment`）で行い、履歴を残す。
- 本文は **1〜500 文字を CHECK 制約**で強制。レート制限は **1ユーザー 24h で 30 件**（admin はバイパス）。
- **closed な依頼にはコメントできない**（INSERT の RLS 条件）。未ログインは閲覧のみでサインイン誘導。
- 通知は **REQ-088 の基盤に event_type を追加するだけ**で実現する。自分のコメントは自分に通知しない。
- 合計工数は **M（1〜2 日）**。

## 各部品

| ファイル | 内容 |
|---|---|
| [01-overview.md](REQ-089-survey-request-comment-integration/01-overview.md) | 要件概要（背景・目的／スコープ／前提条件・制約／テーブル設計案 A・B・C の比較） |
| [02-user-stories.md](REQ-089-survey-request-comment-integration/02-user-stories.md) | ユーザーストーリー US-089-01〜03（直接質問／統合閲覧／通知）と受け入れ条件 |
| [03-functional-requirements.md](REQ-089-survey-request-comment-integration/03-functional-requirements.md) | 機能要件 FR-089-01〜06（テーブル DDL・RLS／spam-check／UI／統合 view／通知／削除 RPC） |
| [04-non-functional.md](REQ-089-survey-request-comment-integration/04-non-functional.md) | 非機能要件（パフォーマンス・セキュリティ・UX・アクセシビリティ） |
| [05-impact-scope.md](REQ-089-survey-request-comment-integration/05-impact-scope.md) | 影響範囲（コード変更ファイル一覧／DB・API・マイグレーション） |
| [06-acceptance-and-risks.md](REQ-089-survey-request-comment-integration/06-acceptance-and-risks.md) | 受け入れ基準 AC-089-01〜09 とリスク・トレードオフ表 |
| [07-priority-and-summary.md](REQ-089-survey-request-comment-integration/07-priority-and-summary.md) | 実装優先度と計画（P0〜P3・合計工数）、サマリー、次のアクション |
