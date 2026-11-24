# REQ-085: 調査依頼一覧ページ `/requests` の追加（Phase 1）

> **位置づけ**: REQ-084 Phase 1 / 親ドキュメント REQ-084 を参照
> **作成日**: 2026-04-25
> **ステータス**: TODO（実装未着手）
> **関連要件**: REQ-084（親）/ REQ-086（次フェーズ・結果投稿フロー）/ REQ-029（フォーム UX）/ REQ-031（a11y）
> **優先度**: P1（調査依頼機能 UX で最大ボトルネック）

---

## 要件概要

### 背景・目的
現状、調査依頼は **地図のオレンジ 🔍 マーカー経由でしか発見できない**。マーカーは `MapView.tsx` 上にしか出ないため:

- 地図を開いていない一般ユーザーには気づきようがない
- 自分が立てた依頼一覧を一括で確認できない
- 市区町村フィルタや緊急度ソートで絞り込めない

REQ-084 のロードマップで Phase 1 として位置付けられた本要件は、**`/requests` 一覧ページを新規追加**し、地図に依存せず依頼を発見・追跡できるようにする。

### スコープ
**含む:**
- `src/app/requests/page.tsx`（App Router エントリ）
- `src/views/SurveyRequestsListPage.tsx`（クライアント UI）
- ステータスフィルタ（open / responded / closed / all）
- 市区町村フィルタ（既存秋田県市区町村リストから選択）
- 緊急度ソート（urgent → normal、created_at desc がデフォルト）
- 既存 `useSurveyRequests` の filter 引数を拡張・再利用
- 一覧から詳細ページ `/request/[id]` への導線
- マイページ「自分が立てた依頼」セクションへのリンク追加
- 空状態（依頼が 0 件 / フィルタヒットなし）の表示

**含まない:**
- 「調査結果を投稿する」ボタンの状態引き継ぎ → REQ-086 で扱う
- 「協力する」ボタン → REQ-087 で扱う
- 通知 → REQ-088 で扱う
- 一覧上での直接インラインコメント → REQ-089 で扱う

### 前提条件・制約
- 既存 hook `useSurveyRequests({ status, species, municipality })` は SELECT 全公開 RLS を活用
- デフォルトでは `closed` を除外する既存ロジックを保持しつつ、UI から `all` を選択可能にする
- ページネーションは **MVP では 200 件 limit のみ**（既存 hook の挙動）。本要件のスコープ外
- モバイルファースト：スマホで縦スクロール、PC ではグリッド表示
- a11y: フィルタは `<select>` または ARIA 付きトグル、緊急度バッジは色だけに依存しない

---

## 分割ファイル

本文は逐語で以下に分割した（この入口は目次と要件概要のみ）。

- [01-user-stories.md](REQ-085-survey-request-list-page/01-user-stories.md) — US-085-01〜03（地図を開かずに探す／自分の依頼一覧／緊急依頼の優先発見）
- [02-functional-requirements.md](REQ-085-survey-request-list-page/02-functional-requirements.md) — FR-085-01〜05（ルーティング、フィルタコンポーネント、カード UI、既存 hook の filter 拡張、空状態／エラー状態）
- [03-nfr-and-impact.md](REQ-085-survey-request-list-page/03-nfr-and-impact.md) — 非機能要件（パフォーマンス・アクセシビリティ・SEO・セキュリティ）と影響範囲（コード変更、DB/API/Storage/マイグレーションは変更なし）
- [04-acceptance-risks-plan-and-summary.md](REQ-085-survey-request-list-page/04-acceptance-risks-plan-and-summary.md) — 受け入れ基準、リスク・トレードオフ、実装優先度と計画（合計 M＝1〜2日）、サマリーと次のアクション

### 要点

- 解消する課題は「調査依頼が**地図のオレンジ 🔍 マーカー経由でしか発見できない**」こと。
- 既存 `useSurveyRequests` は**破壊的変更せず引数を追加するだけ**で実装できる。
- この一覧が Phase 2 以降（REQ-086 結果投稿／REQ-087 協力／REQ-089 コメント）の導線の起点になる。
