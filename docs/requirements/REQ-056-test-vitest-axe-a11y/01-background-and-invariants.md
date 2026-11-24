## 背景
REQ-040 で PostForm / WeatherSelector の `htmlFor` / `id` 関連付けを修正した。しかし現状、a11y 違反を検出する自動テスト基盤が存在せず、再度 `htmlFor` を外す / `aria-label` を消す / ボタンを `<div onClick>` に戻す等のリグレッションが CI を素通りする。
`vitest-axe` を devDependency に追加し、主要フォーム・モーダル・管理画面・詳細画面に対して axe violations === 0 を保証する smoke テストを導入する。

対象:
- `src/components/features/posts/PostForm.tsx`
- `src/components/features/posts/WeatherSelector.tsx`
- `src/components/modals/AuthModal.tsx`
- `src/components/modals/EditDialog.tsx`
- `src/views/admin/AdminLayout.tsx`
- `src/app/post/[id]/DetailPageClient.tsx`

## 守りたい不変条件
- INV-01: 上記 6 コンポーネントの `render()` 結果に対し `axe(container)` が `violations.length === 0` を返す（ただしカテゴリは `label`, `form-field-multiple-labels`, `aria-*`, `button-name`, `link-name`, `image-alt` を必須で、`color-contrast` は参考扱いとして warnings に降格可）
- INV-02: PostForm の各 `<input>` / `<select>` / `<textarea>` は `<label htmlFor="...">` と `id` で 1:1 に関連付けされている（axe の `label` / `label-title-only` / `form-field-multiple-labels` が自動検出）
- INV-03: EditDialog のアクション（保存・キャンセル・削除 等）は `role="button"` とアクセシブル名（text / aria-label）を持つ（axe の `button-name`）

## 現状の検出可否
- `package.json:34-58` の devDependencies に `vitest-axe` / `@axe-core/*` が含まれていない
- 既存テスト（`src/components/modals/__tests__/AuthModal.test.tsx`, `src/components/modals/__tests__/EditDialog.test.tsx` など）は機能テストのみで a11y 違反を検出しない
- ゆえに `htmlFor` 削除 / `aria-label` 削除 / `<button>` → `<div onClick>` 置換が CI でスルーされる
