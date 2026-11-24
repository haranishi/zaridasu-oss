# REQ-090: 調査依頼を立てる UI 入口の追加

> **位置づけ**: REQ-084 全体概要の補完 / 既存バグ起因
> **作成日**: 2026-04-25
> **ステータス**: TODO（実装未着手）
> **関連要件**: REQ-084（親）/ REQ-085（一覧ページ）/ REQ-088（通知の起点）
> **優先度**: P0（既存機能が UI 経路ゼロで完全に到達不能のため、ブロッカー）

---

## これは何か

`SurveyRequestForm` と `survey_requests` テーブルは実装済みなのに、依頼を立てる UI が
どこにも描画されておらず機能に到達できない、という既存バグを解消する要件定義。
本ファイルは入口で、詳細は `REQ-090-survey-request-create-entry/` 配下に分割している。

## 目的・背景（要約）

- `HomePage` は `OPEN_SURVEY_FORM` を dispatch する口を持つが、その引き金の UI が無い。
- `Header` は `onSurveyClick` を Props で受け取るが destructure しておらず未使用。
- `BottomNav` は依頼ボタンを描画せず、`DrawerMenu` には `onSurveyClick` Props 自体が無い。
- 結果、新規依頼の発生源がゼロで、REQ-086〜089 の動作確認も実質不可能になっている。

## 主要な決定事項（要点）

- 入口は 2 箇所に置く: **DrawerMenu の「🔍 調査依頼を立てる」** と **`/requests` 右下の FAB**。
- `Header` は `onSurveyClick` を destructure して `DrawerMenu` に転送するだけ（UI 変更なし）。
- `BottomNav` への追加と地図 UI 上への直接ボタン配置は**見送り**。
- 未ログイン時: DrawerMenu 経由は既存の AuthModal（signup タブ）誘導、`/requests` 経由は `/auth` へ router.push。
- **DB / API / マイグレーションの変更は無し**。既存 `SurveyRequestForm` の API（`{ onClose, onSuccess? }`）も改修しない。
- FAB は safe-area と BottomNav を避けて `bottom-20` 相当、56×56px 以上、`aria-label` 必須。
- 合計工数は **S（半日以内）**。

## 各部品

| ファイル | 内容 |
|---|---|
| [01-overview-and-scope.md](REQ-090-survey-request-create-entry/01-overview-and-scope.md) | 要件概要（背景・目的の詳細／含む・含まないスコープ／前提条件・制約） |
| [02-user-stories.md](REQ-090-survey-request-create-entry/02-user-stories.md) | ユーザーストーリー US-090-01〜04（依頼導線・未ログイン誘導・FAB 配置・a11y） |
| [03-functional-requirements.md](REQ-090-survey-request-create-entry/03-functional-requirements.md) | 機能要件 FR-090-01〜05（メニュー項目・Props 配線・FAB・フォーム連携・未ログイン時） |
| [04-non-functional-requirements.md](REQ-090-survey-request-create-entry/04-non-functional-requirements.md) | 非機能要件（性能・セキュリティ・可用性・WCAG 2.1 AA・レスポンシブ） |
| [05-screen-spec.md](REQ-090-survey-request-create-entry/05-screen-spec.md) | 画面仕様 SC-090-01〜03（DrawerMenu / SurveyRequestsListPage / Header） |
| [06-api-data-migration.md](REQ-090-survey-request-create-entry/06-api-data-migration.md) | API 仕様・データモデル/DB 設計・マイグレーション計画（いずれも新規なし） |
| [07-impact-and-acceptance.md](REQ-090-survey-request-create-entry/07-impact-and-acceptance.md) | 影響範囲（変更ファイルと推定行数・既存テストへの影響）と受け入れ基準 AC-090-01〜12 |
| [08-risks-and-plan.md](REQ-090-survey-request-create-entry/08-risks-and-plan.md) | リスク・トレードオフと実装優先度・計画 |
| [09-summary.md](REQ-090-survey-request-create-entry/09-summary.md) | サマリーと次のアクション（実装〜実機確認の手順） |
