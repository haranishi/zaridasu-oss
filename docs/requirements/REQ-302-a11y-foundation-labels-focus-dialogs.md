# REQ-302: アクセシビリティ基盤の修復（ラベル関連付け・フォーカス管理・ダイアログ・lint ルール）

作成日: 2026-07-30
優先度: **P1** ／ 深刻度: **High** ／ 種別: アクセシビリティ
状態: **提案 / 未実装**
関連: REQ-160（useFocusTrap の共通化・resetKey）, REQ-192（フェッチエラーと空状態の分離）, REQ-163（モーダル ARIA とボタン一貫性）, REQ-196（管理ダイアログのセマンティクス）, REQ-188（EditDialog の aria-label 撤去）, REQ-224（デザイントークン）, REQ-277 / REQ-304（i18n）

## 概要

本アプリは 11 個のモーダルに `role="dialog"` ＋ `aria-modal` ＋ `aria-labelledby` ＋ `useFocusTrap` ＋ `useEscapeKey` を一貫適用しており、a11y の**設計方針そのものは確立している**。問題は (1) その方針から外れている画面が残っていること、(2) 共通フック自体にフォーカス復帰が実装されていないこと、(3) **jsx-a11y が3ルールしか有効化されておらず、方針違反が CI をすり抜ける構造になっていること**の3点である。

そのため本要件は **「lint を先に有効化して以降の退行を止める」→「既存違反を解消する」** の順で実施する。逆順に進めると、修正中に別の箇所で同種の違反が新規に混入しても検出できない。

## 分割ファイル

本文は逐語で以下に分割した（この入口は目次と概要のみ）。

- [01-issues-a-e-lint-labels-focus-drawer.md](REQ-302-a11y-foundation-labels-focus-dialogs/01-issues-a-e-lint-labels-focus-drawer.md) — 背景の問題A〜E（jsx-a11y が3ルールのみ／フォームコントロール19個にラベル無し／`useFocusTrap` がフォーカス復帰しない／DrawerMenu が閉状態でもタブ順に残る／フィルタードロワーがダイアログでない）
- [02-issues-f-j-dialogs-icons-aria.md](REQ-302-a11y-foundation-labels-focus-dialogs/02-issues-f-j-dialogs-icons-aria.md) — 背景の問題F〜J（iOS ガイドモーダルの名前と初期フォーカス／アイコンのみボタン3箇所／任意入力の `aria-required` 矛盾／DeleteDialog の日本語ハードコード／`/dashboard` に `<h1>` が無い＝REQ-315 が正本）
- [03-functional-requirements.md](REQ-302-a11y-foundation-labels-focus-dialogs/03-functional-requirements.md) — 機能要件（フェーズ0 検出基盤 → フェーズ1 基盤フックとラベル → フェーズ2 ダイアログとドロワー）
- [04-acceptance-open-questions-and-debt.md](REQ-302-a11y-foundation-labels-focus-dialogs/04-acceptance-open-questions-and-debt.md) — 受入基準 AC-01〜11、検討事項／要確認、実施後に残った技術的負債（2026-07-30・ファイル限定 off の除外リスト）

### 押さえておく要点

- **順序が重要**: lint を先に有効化してから既存違反を潰す。逆順だと修正中の新規混入を検出できない。
- AC-08（`/dashboard` の `<h1>`）は本REQの検収対象外で **REQ-315 が正本**。
- 実施後、jsx-a11y recommended 34ルールを error 昇格した際に**変更禁止範囲の既存違反をファイル限定 off で除外**しており、その回収が後続a11y作業の宿題として残っている。
