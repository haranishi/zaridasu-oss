## 機能要件

実施順序は **FR-302-01 → FR-302-02 以降** を厳守する（lint を先に入れて退行を止めてから既存違反を直す）。

### フェーズ0: 検出基盤（先に入れる）

- **FR-302-01**: `eslint.config.js` の JS/JSX ブロック（`:51-53`）と TS/TSX ブロック（`:114-116`）の両方に `...jsxA11y.flatConfigs.recommended.rules` を追加する。**段階的 error 化の方針**は次のとおり。
  1. まず recommended 一式を **`warn`** で導入し、`npm run lint` の警告一覧で既存違反の全量を確定させる（この時点で CI を落とさない）。
  2. 既存違反を FR-302-02 以降で解消したルールから順に **`error` へ昇格**する。ルール単位で昇格し、「全部直るまで全部 warn」で止めない。
  3. 既に error である3ルール（`alt-text` / `click-events-have-key-events` / `no-static-element-interactions`）は error のまま維持する。
  4. 意図的に方針から外す箇所（例: `src/components/modals/SurveyRequestForm.tsx:118` の背景クリック用 disable）は、既存と同様に**理由コメント付きの `eslint-disable`** で明示する。ルールごとの一括 off は行わない。
- **FR-302-02**: `vitest-axe` による a11y テストを**11モーダル全件**と主要ビュー（ホーム／ダッシュボード／図鑑／地図を含む画面）へ拡大する。少なくとも本要件で修正した各画面に1ケースずつ追加し、`critical` / `serious` 違反ゼロを検証する。

### フェーズ1: 基盤フックとラベル

- **FR-302-03**: `useFocusTrap` にフォーカス復帰を実装する。有効化時に `document.activeElement` を保存し、cleanup で元の要素へ `.focus()` を戻す（元要素が DOM から消えている場合の安全なフォールバックを含む）。REQ-160 の `resetKey` による張り直し時に**復帰対象が上書きされない**ようにする。トラップ対象要素の再クエリ（動的に増減する focusable への追従）も併せて検討する。
- **FR-302-04**: 問題B の19件に `htmlFor` / `id` を付与する（実装は `LocationSection.tsx:141,170` の既存パターンに合わせる）。ラジオ/ボタン群の見出しとして使われている `<label>`（`src/components/modals/ReportModal.tsx:119`、`src/components/modals/SurveyRequestForm.tsx:205`、`src/components/modals/RejectDialog.tsx:44`、`src/components/features/posts/PhotoUploadSection.tsx:40`）は、`<fieldset>` / `<legend>` または `role="group"` ＋ `aria-labelledby`（`PostForm.tsx:331,361` の既存パターン）へ置き換える。
- **FR-302-05**: 問題G の3件に `aria-label={t('...')}` を付与する。**日本語リテラルを直書きしない**（REQ-304 と同方針）。
- **FR-302-06**: 問題H の `aria-required="true"` を任意フィールドから削除する。実際に必須の項目のみ `required` ＋ `aria-required` を付ける。

### フェーズ2: ダイアログとドロワー

- **FR-302-07**: `DrawerMenu` を他モーダルと同じ扱いに揃える。`open === false` のときは早期 return するか、`inert` / `hidden` を付与して**タブ順と読み上げから完全に外す**。`aria-modal="true"` は開いている間だけ付与する。開閉時のフォーカス移動を `useFocusTrap`（FR-302-03 修正版）に合わせる。
- **FR-302-08**: `FilterBar` のフィルタードロワーを標準形（`role="dialog"` ＋ `aria-modal` ＋ `aria-labelledby` ＋ `useFocusTrap` ＋ `useEscapeKey`（document リスナ））へ揃える。閉じるボタンに `aria-label={t('...')}` を付ける。
- **FR-302-09**: `InstallBanner` の iOS ガイドモーダルの `<h3>` に `id` を付けて `aria-labelledby` から参照し、`useFocusTrap` ＋ `useEscapeKey` を他モーダル同様に適用する。
- **FR-302-10**: `DeleteDialog.tsx:46,49` の日本語直書き `aria-label` を撤去する（可視テキストで足りるため削除を第一選択とし、残す場合は `t()` 経由にして可視テキストと一致させる）。REQ-188 の `EditDialog` の対応と同じ判断に揃える。
- ~~**FR-302-11**: `DashboardPage` に sr-only の `<h1>` を追加する。~~ → **[REQ-315](REQ-315-minor-ux-and-ops-hygiene.md) FR-315-07 に移管**（二重実装を避けるため本REQでは実施しない）。
