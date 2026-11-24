# REQ-151: フォームの label-input 未関連付け（htmlFor / id 欠落）

## 背景
ザリダス（Next.js 15 / React）の認証モーダル `AuthModal.tsx` では、フォーム入力フィールドのラベルと入力要素が視覚的に隣接しているだけで、プログラム的（DOM 上）には関連付けられていない。`<label>` に `htmlFor` 属性がなく、対応する `<input>` にも `id` 属性が付与されていないため、ラベルクリックでフォーカスが移らず、スクリーンリーダーが入力欄の名前（accessible name）を取得できない。

WCAG 2.1 の以下の達成基準に抵触する:
- **1.3.1 情報及び関係性（レベル A）**: 視覚的に表現されたラベルと入力の関係が、プログラムによる解釈で利用できない。
- **4.1.2 名前・役割・値（レベル A）**: 入力コントロールに accessible name が設定されていない。

## 現状の問題
### AuthModal.tsx（`src/components/modals/AuthModal.tsx`）
- メールアドレス: `<label>`（334行）に `htmlFor` なし / `<input ref={emailRef} type="email">`（337行〜353行）に `id` なし。
- パスワード: `<label>`（359行）に `htmlFor` なし / `<input type="password">`（362行〜371行）に `id` なし。
- パスワード（確認）: `<label>`（391行）に `htmlFor` なし / `<input type="password">`（394行〜403行）に `id` なし。

3 つの入力欄いずれも `<label>` は `className` のみで、`htmlFor` を持たない。`<input>` 側も `id` を持たない。結果として `label` と `input` の関連付けが一切存在しない。

加えて、334行のメール `<input>` には現状 `aria-invalid` や `aria-describedby` も付与されておらず、354行の `emailError`（バリデーションエラーメッセージ）が入力欄とプログラム的に紐づいていない。

### PostForm.tsx（`src/components/features/posts/PostForm.tsx`）
PostForm 側は **既に多くの入力欄で `id` + `htmlFor` が対応済み**であることをコードで確認した:
- 個体数: `<label htmlFor="postform-count">`（332行） / `<input id="postform-count">`（336行） — 対応済み。
- 観察日: `<label htmlFor="postform-observed-at">`（357行） / `<input id="postform-observed-at">`（361行） — 対応済み。
- 調査時間: `<label htmlFor="postform-survey-duration">`（368行） / `<input id="postform-survey-duration">`（372行） — 対応済み。
- コメント: `<label htmlFor="postform-comment">`（394行） / `<textarea id="postform-comment">`（398行） — 対応済み。

一方、以下は `htmlFor` / `id` の対応付けがなく未対応:
- 種別（284行〜302行）: `<label>`（276行）に `htmlFor` なし。入力は `SPECIES.map` によるトグルボタン群（`<button>`）であり、グループ全体を表すラベルがない。
- 情報種別（306行）: `<label>` に `htmlFor` なし。入力はボタン群（310行〜316行）。

これらボタン群はネイティブ `<input>` ではないため、`htmlFor` ではなく `role="group"` + `aria-labelledby` でラベルとグループを関連付けるのが適切。

## 目的
全フォームコントロールに対し、ラベルと入力をプログラム的に関連付け、WCAG 1.3.1 / 4.1.2（レベル A）を満たす。ラベルクリックでフォーカスが移る挙動とスクリーンリーダーでの正しい読み上げを実現する。

## 要件
### 機能要件
- [ ] FR-151-01: `AuthModal.tsx` のメール入力に一意な `id`（例: `auth-email`）を付与し、対応する `<label>`（334行）に同値の `htmlFor` を付与する。
- [ ] FR-151-02: `AuthModal.tsx` のパスワード入力に一意な `id`（例: `auth-password`）を付与し、対応する `<label>`（359行）に同値の `htmlFor` を付与する。
- [ ] FR-151-03: `AuthModal.tsx` のパスワード確認入力に一意な `id`（例: `auth-password-confirm`）を付与し、対応する `<label>`（391行）に同値の `htmlFor` を付与する。
- [ ] FR-151-04: `AuthModal.tsx` のメール入力に対し、エラー時 `aria-invalid={!!emailError}` を付与し、`emailError`（354行のメッセージ）に `id` を与えて入力欄から `aria-describedby` で参照する。
- [ ] FR-151-05: `PostForm.tsx` の種別ボタン群（284行〜302行）を `role="group"` でまとめ、見出しラベル（276行）に `id` を付与して群に `aria-labelledby` で関連付ける。
- [ ] FR-151-06: `PostForm.tsx` の情報種別ボタン群（309行〜317行）に対しても FR-151-05 と同様にグループラベルを関連付ける。
- [ ] FR-151-07: PostForm の既存の `id`/`htmlFor` 対応済み入力（count / observed-at / survey-duration / comment）は現状を維持し、回帰させない。

### 非機能要件（該当する場合）
- [ ] NFR-151-01: `id` は同一ページ内で衝突しないよう、コンポーネント固有のプレフィックス（例: `auth-`, `postform-`）を用いる。
- [ ] NFR-151-02: 変更後、`vitest-axe` 等の自動アクセシビリティ検査で label 関連の違反が 0 件であること。

## 受入条件
- [ ] AC-01: AuthModal のメール / パスワード / パスワード確認の各ラベルをクリックすると、対応する入力欄にフォーカスが移る。
- [ ] AC-02: スクリーンリーダーで各入力欄にフォーカスした際、対応するラベル文言が accessible name として読み上げられる。
- [ ] AC-03: AuthModal のメール欄でバリデーションエラー発生時、`aria-invalid="true"` となり、エラーメッセージが `aria-describedby` で読み上げられる。
- [ ] AC-04: PostForm の種別・情報種別のボタン群が、スクリーンリーダーでグループ名（種別 / 情報種別）とともに認識される。
- [ ] AC-05: 自動アクセシビリティ検査（axe）で、対象 2 コンポーネントに label / accessible name 関連の違反が出ない。

## 影響範囲
- `src/components/modals/AuthModal.tsx`（334〜403行付近）
- `src/components/features/posts/PostForm.tsx`（276〜317行付近。既存の id 付与済み箇所は維持）
- 関連テスト: `src/components/modals/__tests__/` 配下の AuthModal テスト、PostForm のアクセシビリティテスト（存在する場合）

## 優先度
- **緊急度**: 中 / **重要度**: 高 / **理由**: WCAG レベル A の必須基準（1.3.1 / 4.1.2）に対する違反であり、スクリーンリーダー利用者のフォーム操作を直接妨げる。修正は属性追加のみで影響範囲が局所的かつ低リスクのため、早期に着手すべき。
