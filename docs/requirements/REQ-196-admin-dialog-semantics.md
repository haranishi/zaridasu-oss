# REQ-196: 管理者向けダイアログの dialog セマンティクスとフォーカス管理

## 背景
ザリダスのモーダル群はフォーカス管理・ダイアログセマンティクスを REQ-160（focus trap 共通化）・REQ-163（aria-labelledby）で整備してきたが、管理者向けの確認ダイアログ 2 つがこれらの対象一覧から漏れている。

参照すべき既存の正しいパターン: `src/components/modals/DeleteDialog.tsx`（33行）。
- ルート `<div ... role="dialog" aria-modal="true" aria-labelledby="delete-dialog-title">`（33行）+ `<h3 id="delete-dialog-title">`（35行）。
- `useEscapeKey(onCancel)` + `useFocusTrap(dialogRef)`（29〜30行）。
- ボタンに `aria-label`、共通スタイル（`btnSecondaryCls` / `btnDestructiveCls`）。

WCAG 2.1 の関連:
- **2.1.2 / 2.4.3（レベル A）**: モーダルはフォーカスを内部に保持し、Escape で閉じられること。
- **4.1.2（レベル A）**: ダイアログに accessible name が必要。
- **1.3.1（レベル A）**: label と入力の関連付け。

## 現状の問題
- `src/components/modals/DeletePostDialog.tsx:17` — `fixed inset-0` のモーダルだが、`role="dialog"` / `aria-modal` / accessible name（`aria-labelledby`）/ focus trap / Escape ハンドリングが**すべてない**。見出し `<h3>`（19行）に `id` もない。
- `src/components/modals/RejectDialog.tsx:27` — 同上（27行のルート `<div>` に dialog セマンティクス・focus trap・Escape なし、見出し `<h3>` 29行に `id` なし）。加えて「管理者メッセージ」`<label>`（52〜54行）と `<textarea>`（55〜61行）が `htmlFor` / `id` で**関連付けられていない**。

> 補足: RejectDialog は見出し（29行）・却下理由ラベル（34行）・各種文言（66行「キャンセル」/72行「却下する」等）がハードコード日本語であり、`useTranslation` を使っていない。本要件の主眼は dialog セマンティクスとフォーカス管理だが、改修時に i18n 化も併せて検討してよい（必須ではない）。

これらは**管理者限定画面**でのみ表示されるため、エンドユーザーへの影響範囲は限定的であり、優先度は中とする。ただし WCAG レベル A の項目であることに変わりはない。

## 目的
管理者向けダイアログ 2 つを、既存の `DeleteDialog.tsx` と同一の dialog セマンティクス（`role="dialog"` + `aria-modal` + `aria-labelledby`）・フォーカス管理（`useFocusTrap` + `useEscapeKey`）へ統一する。RejectDialog の label/textarea を関連付ける。

## 要件
### 機能要件
- [ ] FR-196-01: `DeletePostDialog.tsx` のルート `<div>`（17行）に `role="dialog"` / `aria-modal="true"` / `aria-labelledby`（見出し `id` 参照）を付与し、見出し `<h3>`（19行）に一意な `id`（例: `delete-post-dialog-title`）を付与する。
- [ ] FR-196-02: `DeletePostDialog.tsx` に `useFocusTrap`（内側パネル `<div>` 18行に `ref`）と `useEscapeKey(onCancel)` を導入する。
- [ ] FR-196-03: `RejectDialog.tsx` のルート `<div>`（27行）に `role="dialog"` / `aria-modal="true"` / `aria-labelledby`（見出し `id` 参照）を付与し、見出し `<h3>`（29行）に一意な `id`（例: `reject-dialog-title`）を付与する。
- [ ] FR-196-04: `RejectDialog.tsx` に `useFocusTrap`（内側パネル `<div>` 28行に `ref`）と `useEscapeKey(onCancel)` を導入する。
- [ ] FR-196-05: `RejectDialog.tsx` の「管理者メッセージ」`<label>`（52行）に `htmlFor="reject-message"`、`<textarea>`（55行）に `id="reject-message"` を付与して関連付ける。
- [ ] FR-196-06: 両ダイアログのボタン（DeletePostDialog 25・28行 / RejectDialog 65・68行）に accessible name（テキストがある場合は不要だが、アイコン化されている箇所があれば `aria-label`）と、可能なら共通スタイル（`btnSecondaryCls` / `btnDestructiveCls`）を適用する。

### 非機能要件（該当する場合のみ）
- [ ] NFR-196-01: 改修は `DeleteDialog.tsx` の構成・`useFocusTrap` / `useEscapeKey` を再利用し、独自実装を作らない（DRY・一貫性）。

## 受入条件
- [ ] AC-01: DeletePostDialog / RejectDialog を開くとフォーカスがダイアログ内に入り、`Tab` 巡回が内部に閉じる。
- [ ] AC-02: 両ダイアログとも `Escape` で閉じる（`onCancel` が呼ばれる）。
- [ ] AC-03: スクリーンリーダーで両ダイアログを開くと、見出し文言がダイアログ名として読み上げられる。
- [ ] AC-04: RejectDialog の「管理者メッセージ」textarea がラベルと関連付き、ラベルクリックでフォーカスが移る。
- [ ] AC-05: vitest-axe による検証で、両ダイアログ（または代表スニペット）に dialog name / label 関連付けの違反が 0 件。
- [ ] AC-06: 既存の管理者画面（投稿管理）関連テストが全て成功する。

## 影響範囲
- `src/components/modals/DeletePostDialog.tsx`（17行・18行・19行・25行・28行）
- `src/components/modals/RejectDialog.tsx`（27行・28行・29行・52行・55行・65行・68行）
- `src/hooks/useFocusTrap.ts` / `src/hooks/useEscapeKey.ts`（再利用）
- 参照元: `src/components/modals/DeleteDialog.tsx`
- 関連テスト: `src/components/modals/__tests__/`（admin ダイアログ分があれば）
- 関連: REQ-160 / REQ-163

## 優先度
- **緊急度**: 中 / **重要度**: 中 / **理由**: WCAG レベル A の項目だが、表示対象が管理者限定画面のため影響範囲が限定的。既存 `DeleteDialog.tsx` パターンの流用で機械的に解消でき、リスクは低い。ユーザー向けモーダル（REQ-187〜189）を優先したうえで対応する。
