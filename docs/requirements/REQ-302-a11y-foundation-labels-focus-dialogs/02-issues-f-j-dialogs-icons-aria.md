### 問題F: InstallBanner の iOS ガイドモーダルにアクセシブルネームと初期フォーカスが無い — Medium

- `src/components/ui/InstallBanner.tsx:41-47`。`role="dialog"` `aria-modal="true"` を持つが **`aria-label` / `aria-labelledby` が無く**、`:56-58` の `<h3>{t('install.iosTitle')}</h3>` にも `id` が無いため紐付けられていない。axe の `aria-dialog-name` 違反。
- **初期フォーカス移動が無い**ため、`:46` の `onKeyDown` に置かれた Escape 判定が開いた直後に発火しない。フォーカストラップも無い。
- iOS 利用者に PWA インストール手順を示す唯一のモーダルが、無名ダイアログとしてキーボードでは閉じられない状態で提示される。

### 問題G: アイコンのみのボタン3箇所に aria-label が無い — Medium

- `src/components/features/dashboard/FilterBar.tsx:203`（`<X>` ドロワー閉じる。問題E と同一箇所）
- `src/views/DashboardPage.tsx:211-216`（`<Edit2>` プロフィール編集）
- `src/components/modals/EditDialog.tsx:191-198`（`<Plus>` 写真を追加。写真枚数が上限未満のときだけ描画される追加ボタン）

網羅確認の結果、全 `.tsx` を機械走査して `aria-label` / `title` / テキストのいずれも持たない `<button>` は7件のみで、**残り4件（`src/components/ui/PhotoViewer.tsx:124`、`src/components/features/admin/ReviewCard.tsx:95`、`src/views/admin/AdminPostsPage.tsx:373,454`）は内部の `<Image alt>` からアクセシブルネームを得ており問題ない**。したがって対応が必要なのは上記3件に限られる。

### 問題H: 任意の入力欄に `aria-required="true"` が付き、視覚表示と支援技術で矛盾する — Medium

- `src/components/modals/ReportModal.tsx:145` が `aria-required="true"` を持つ一方、`:140` は `{t('report.commentOptional')}` で**「任意」と明示**している。スクリーンリーダー利用者は必須と誤解し、書かないと通報できないと思い込む。
- 同種として `src/components/features/dashboard/FilterBar.tsx:211`（期間 select）と `:238`（並び順 select）にも `aria-required="true"` があるが、いずれも**常に値を持つ select** で必須の意味がない。

### 問題I: DeleteDialog の aria-label が日本語ハードコードで、可視テキストと一致しない — Low

- `src/components/modals/DeleteDialog.tsx:46` が `aria-label="キャンセル"`、`:49` が `aria-label="削除する"`。一方で可視テキストは `t('delete.cancel')` / `t('delete.confirm')`（deleting 中は `t('delete.deleting')`）で **`t()` 経由**。
- 言語を en/ko/zh に切り替えると、可視ラベルとアクセシブルネームが**別言語で不一致**になる。音声入力（「◯◯をタップ」）が可視ラベルで動作しない。WCAG 2.5.3（Label in Name）。
- REQ-188 では `EditDialog` の同種の直書き `aria-label` を撤去済み（`src/components/modals/__tests__/EditDialog.test.tsx:92` にその意図が記録されている）。**DeleteDialog はその修正が展開されていない。**
- 本件は REQ-277 の Phase 1 / Phase 2 対象表のどちらにも含まれていない。

### 問題J: /dashboard に `<h1>` が無い — Low（→ **REQ-315 が正本**）

- `src/views/DashboardPage.tsx` の最初の見出しは `:208` の `<h2>`。`/dashboard` は noindex なので SEO への影響はないが、**見出しジャンプでページを移動するスクリーンリーダー利用者にページの主題が伝わらない**。
- ⚠️ **本項目は [REQ-315](REQ-315-minor-ux-and-ops-hygiene.md) の問題F / FR-315-07 / AC-08 が正本**（i18nキー経由・sr-only・レイアウト非変更の具体指定を含む）。二重実装を避けるため、本REQでは着手しない。a11y観点の記録としてのみ残す。
