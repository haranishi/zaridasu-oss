# REQ-086: 調査結果投稿フローの確立（Phase 2）

> **位置づけ**: REQ-084 Phase 2 / 親ドキュメント REQ-084 を参照
> **作成日**: 2026-04-25
> **ステータス**: TODO（実装未着手）
> **関連要件**: REQ-084（親）/ REQ-085（前フェーズ・一覧ページ）/ REQ-087（次フェーズ・応答機能）/ REQ-021（PostForm リファクタ）
> **優先度**: P1（依頼ループの中核・データ整合性に直結）

---

## これは何か

調査依頼から結果投稿への動線を繋ぎ、**`posts.survey_request_id` の付与と
`survey_requests.status` の自動遷移**まで完成させる要件定義。REQ-084 の Phase 2。

## 目的・背景

`/request/[id]` の「調査結果を投稿する」ボタンは現状 `router.push('/')` するだけで
**`survey_request_id` を引き継いでいない**。そのため作成された `posts` の `survey_request_id` が
NULL のままになり、さらに `status` を `responded` へ遷移させるロジックも存在しないため依頼が
open のまま停滞する。本要件は「依頼 → 結果投稿」の連結と status 自動遷移を担う。

## 主要な決定事項（要点）

- 引き継ぎは **URL クエリ `?surveyRequest=<uuid>`**。UUID の形式チェックのみ行い、実在性は **FK 制約に委ねる**。
  形式不正なら id を送らず**通常投稿にフォールバック**する。
- **既存 `PostForm` を流用**し、結果投稿専用フォームは作らない。上部に「依頼への返信」バナーを出し、
  **「紐付けを解除」ボタン**で誤クリックから戻れるようにする。
- status 遷移は **`posts` の AFTER INSERT トリガー**（`mark_survey_request_responded`）。
  `survey_requests` の RLS が owner-only update のため **SECURITY DEFINER が必須**。
  ただし**触るのは status 列だけ**、`WHERE status = 'open'` で限定するので closed は巻き戻らず冪等。
- 結果投稿が後に rejected になった場合は**初期実装では responded のまま**（次フェーズで再検討）。
- `survey_request_id` の事後書き換えは REQ-034 の `restrict_user_columns` トリガーで禁止する。
- 既存の紐付け済みデータ向けに**バックフィル SQL**（任意）をマイグレーション末尾に入れる。
- 合計工数は **M（1〜2 日）**。

## 各部品

| ファイル | 内容 |
|---|---|
| [01-overview.md](REQ-086-survey-request-result-flow/01-overview.md) | 要件概要（背景・目的／スコープの含む・含まない／前提条件・制約） |
| [02-user-stories.md](REQ-086-survey-request-result-flow/02-user-stories.md) | ユーザーストーリー US-086-01〜03（紐付け確実性／status 前進／誤紐付け防止）と受け入れ条件 |
| [03-functional-requirements.md](REQ-086-survey-request-result-flow/03-functional-requirements.md) | 機能要件 FR-086-01〜05（動線改修・PostForm 受け渡し・バナー・status トリガー DDL・バックフィル SQL） |
| [04-non-functional.md](REQ-086-survey-request-result-flow/04-non-functional.md) | 非機能要件（パフォーマンス・セキュリティ・UX） |
| [05-impact-scope.md](REQ-086-survey-request-result-flow/05-impact-scope.md) | 影響範囲（コード変更ファイル一覧／DB・マイグレーション） |
| [06-acceptance-and-risks.md](REQ-086-survey-request-result-flow/06-acceptance-and-risks.md) | 受け入れ基準 AC-086-01〜08 とリスク・トレードオフ表 |
| [07-priority-and-summary.md](REQ-086-survey-request-result-flow/07-priority-and-summary.md) | 実装優先度と計画（P0〜P2・合計工数）、サマリー、次のアクション |
