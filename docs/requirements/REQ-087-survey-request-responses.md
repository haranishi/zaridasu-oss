# REQ-087: 調査依頼への応答 / 協力機能（Phase 3）

> **位置づけ**: REQ-084 Phase 3 / 親ドキュメント REQ-084 を参照
> **作成日**: 2026-04-25
> **ステータス**: TODO（実装未着手）
> **関連要件**: REQ-084（親）/ REQ-086（前フェーズ・結果投稿）/ REQ-088（次フェーズ・通知）/ REQ-007（spam-check）/ REQ-025（RLS）
> **優先度**: P2（コミュニティの軽量関与を可能にする）

---

## これは何か

調査依頼に対して「結果投稿（重い）」と「無視」しかなかった二択に、「協力する」という軽量な中間アクションを足す要件。
本文は全文を下の部品ファイルへ逐語で移動してある（この入口の要約部分のみ新規記述）。

## 目的・背景の要約

「すぐ調査には行けないが、見守り／関心表明はしたい」というニーズに応える手段が無い。また `survey_requests.response_count INTEGER NOT NULL DEFAULT 0` は既に存在するのに完全に未使用。この列を活かしつつ、重複応答防止・レート制限・応答取消し・応答者一覧 UI までを整備する。

## 主要な決定事項の要点

- **テーブル設計は案 B を採用** — `survey_request_responses (request_id, user_id, created_at)` を新設し、`response_count` は集計トリガーで同期する**キャッシュ列**として残す（一覧の N+1 を防ぐため廃止しない）。案 A（カウンタのみ）は重複防止・一覧が不可、案 C（`likes` へ polymorphic 追加）は likes の意味が崩れるため不採用。
- **重複防止は DB の `UNIQUE (request_id, user_id)`** で担保。匿名応答は許可しない（重複防止が崩れるため identity は `user_id`）。
- **制約はすべて DB トリガー側**に置く — `response_count` 同期は AFTER INSERT/DELETE、closed 依頼への応答禁止は BEFORE INSERT で `RAISE EXCEPTION`、レート制限は既存 `check_survey_request_rate_limit` を踏襲して **24h あたり 20 応答まで**（admin はバイパス）。
- **UI は楽観的更新**。取消しは確認ダイアログ無しで即実行（軽量アクション）。自分が立てた依頼ではボタン非表示、未ログイン時はサインインへ誘導。
- 応答者一覧は**最大 10 件・新しい順**、一覧ページのカードにも応答数を表示する。
- 新規 hook `src/hooks/useSurveyResponses.ts` に取得／作成／取消しを集約する。
- スコープ外: 応答の通知（→ REQ-088。本 Phase ではフックポイントのみ用意）、応答メッセージ（→ REQ-089）、応答数バッジのゲーミフィケーション（別要件）。
- 合計工数は **L（2〜3 日）**。

## 部品ファイル

| ファイル | 内容 |
|---|---|
| [01-overview.md](REQ-087-survey-request-responses/01-overview.md) | 要件概要 — 背景・目的、スコープ（含む／含まない）、前提条件・制約、テーブル設計案 A/B/C の比較表 |
| [02-user-stories.md](REQ-087-survey-request-responses/02-user-stories.md) | ユーザーストーリー US-087-01〜03（関心表明、依頼者の応答数把握、応答スパム防止） |
| [03-functional-requirements.md](REQ-087-survey-request-responses/03-functional-requirements.md) | 機能要件 FR-087-01〜07 — テーブル DDL と RLS、同期トリガー、closed ガード、レート制限、詳細ページ UI、一覧カード、hook API |
| [04-non-functional-requirements.md](REQ-087-survey-request-responses/04-non-functional-requirements.md) | 非機能要件 — パフォーマンス（P95 50ms）、セキュリティ、データ整合性、UX |
| [05-impact-and-acceptance.md](REQ-087-survey-request-responses/05-impact-and-acceptance.md) | 影響範囲（コード変更／DB・マイグレーション）と受け入れ基準 AC-087-01〜09 |
| [06-risks-plan-summary.md](REQ-087-survey-request-responses/06-risks-plan-summary.md) | リスク・トレードオフ、実装優先度と計画、サマリーと次のアクション |
