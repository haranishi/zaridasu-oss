# REQ-271: ドロワー「調査を依頼する」が4画面で存在しない /survey に遷移し404

優先度: **P0** ／ 深刻度: **High** ／ 種別: UXバグ（導線破損）

## 背景

DrawerMenu の「調査を依頼する」（`src/components/layout/DrawerMenu.tsx:211-222`）は `onSurveyClick` prop 経由で動作する。HomePage だけは `dispatch({ type: 'OPEN_SURVEY_FORM' })` で調査依頼フォームのモーダルを正しく開くが、以下の4画面は **存在しないルート `/survey` へ遷移**しており、タップすると404（NotFoundPage）に落ちる:

- `src/views/DashboardPage.tsx:189`
- `src/views/TrendsPage.tsx:38`
- `src/views/RankingPage.tsx:103`
- `src/views/CollectionPage.tsx:73`

いずれも `onSurveyClick={() => router.push('/survey')}`。`src/app/survey/` は存在せず（確認済み）、`next.config.ts` にリダイレクトも無い。主要導線の一つが4画面で恒常的に壊れている。

## 機能要件

- **FR-271-01**: 4画面の `onSurveyClick` を、404にならない実在の導線に修正する。第一候補: `/requests`（調査依頼一覧）へ遷移し、一覧側の「調査依頼を立てる」FABから作成フローに入れるようにする。一覧ページが作成モーダルの自動オープンに対応できる場合（例: クエリパラメータ）はそれを利用してもよい。
- **FR-271-02**: 修正後、「調査を依頼する」がどの画面のドロワーから押しても404にならないこと。
- **FR-271-03**: 回帰防止として、`/survey` 文字列がルーティング先として残存しないこと（grep で0件）。

## 受入基準

- **AC-01**: Dashboard / Trends / Ranking / Collection 各画面でドロワーから「調査を依頼する」をタップし、404にならず調査依頼の作成に到達できる。
- **AC-02**: HomePage の既存挙動（モーダル直接オープン）は変更されない。
- **AC-03**: `lint` / `type-check` / 既存テストが全てパス。

## 対象外

- `/survey` ルートの新設（一覧＋モーダルの既存資産を使う方が整合的）。
