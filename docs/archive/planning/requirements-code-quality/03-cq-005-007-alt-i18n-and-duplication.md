## CQ-005: alt 属性の不備（アクセシビリティ）

### 問題

スクリーンリーダーが画像の内容を読み上げられない。WCAG 2.1 AA 違反。

### 対象箇所

| ファイル | 行 | 問題 |
|---------|-----|-----|
| `src/pages/admin/AdminPostsPage.jsx` | 364, 374 | `alt=""` — 空文字で内容不明 |
| `src/components/ui/PhotoViewer.jsx` | 109 | `alt=""` — 空文字 |
| `src/components/features/dashboard/MyPostsSection.jsx` | 71, 84 | `alt=""` — 空文字 |

### 受け入れ条件

- [ ] **装飾的画像**（背景・アイコン）には `alt=""` と `role="presentation"` を付与する
- [ ] **コンテンツ画像**（投稿写真・種類アイコン）には意味のある alt テキストを付与する
  - 投稿写真: `alt={t('detail.expandPhoto', { n: i + 1 })}` のように動的生成
  - 種類アイコン: `alt={species?.label ?? t('detail.unknown')}`
- [ ] PhotoViewer の投稿写真は `alt={t('photo.alt', { n: index + 1 })}` を使用する

---

## CQ-006: エラーメッセージの i18n 未対応

### 問題

フック内のエラーメッセージが日本語ハードコードされており、多言語対応の障壁になる。

### 対象箇所

| ファイル | メッセージ |
|---------|-----------|
| `src/hooks/usePostForm.js` | `'対応していないファイル形式です'`, `'5MBを超えています'`, `'24時間以内の投稿上限'` など |
| `src/hooks/useDeletePost.js` | `'削除に失敗しました。'` |
| `src/hooks/useEditPost.js` | `'保存に失敗しました'` |

### 受け入れ条件

- [ ] hooks 内で `useTranslation()` を使うか、呼び出し元コンポーネントで翻訳する方針を決める
- [ ] 推奨: hook はエラーコード文字列（例: `'upload.typeError'`）を返し、コンポーネントで `t(errorCode)` する
- [ ] 翻訳キーを `public/locales/ja/translation.json`（または i18n の設定ファイル）に追加する

---

## CQ-007: 重複コード

### 問題

同一ロジックが複数ファイルに分散して存在し、変更時に修正漏れが発生しやすい。

### 対象パターン

| ロジック | 重複ファイル |
|---------|-------------|
| Supabase Storage から写真削除 | `usePostForm.js`, `useDeletePost.js`, `AdminPostsPage.jsx` |
| 写真パス（URL→path）抽出 | `storage.js`, `AdminPostsPage.jsx` |
| 市区町村ランキング集計 | `useAdminStats.js`, `useStats.js` |
| 日時フォーマット | `useAdminStats.js`, `AdminUsersPage.jsx` |

### 受け入れ条件

- [ ] 写真削除ロジックを `src/utils/storage.js` の `deletePhotos(paths[])` に統一する
- [ ] 写真URL→path変換を `src/utils/storage.js` の `extractPath(url)` に統一する
- [ ] `useAdminStats.js` と `useStats.js` の市区町村集計を共通ヘルパーに抽出する
- [ ] 既存の `storage.js` のインターフェースを保ちながら関数を追加する

---

