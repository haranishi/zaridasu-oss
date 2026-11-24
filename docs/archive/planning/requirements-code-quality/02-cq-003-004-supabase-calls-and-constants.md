## CQ-003: コンポーネントからの supabase 直接呼び出し

### 問題

Page・Modal コンポーネントが `supabase` を直接呼び出している。
テスト困難・ロジック再利用不可・エラーハンドリング分散の原因。

### 対象箇所（主要）

| ファイル | 主なクエリ |
|---------|-----------|
| `src/pages/DetailPage.jsx` | `posts` 取得 |
| `src/pages/admin/AdminPostsPage.jsx` | 投稿取得・削除・一括削除 |
| `src/pages/admin/AdminUsersPage.jsx` | ユーザー一覧 RPC |
| `src/pages/admin/AdminCommentsPage.jsx` | コメント削除 |
| `src/pages/admin/AdminReportsPage.jsx` | 通報取得・処理 |
| `src/pages/admin/AdminLogsPage.jsx` | ログ RPC |
| `src/pages/AuthCallbackPage.jsx` | Auth state 変更 |
| `src/components/modals/AuthModal.jsx` | ログイン・サインアップ・パスワードリセット |
| `src/components/modals/ReportModal.jsx` | 通報 insert |
| `src/components/features/posts/CommentSection.jsx` | コメント取得・投稿・通知 |

### 受け入れ条件

**フェーズ A（高優先）**
- [ ] `CommentSection.jsx` → `useComments(postId)` hook に抽出
- [ ] `ReportModal.jsx` → `useReport()` hook に抽出
- [ ] `DetailPage.jsx` → `usePost(id)` hook に抽出

**フェーズ B（中優先）**
- [ ] `AuthModal.jsx` → `useAuthActions()` hook に抽出
- [ ] `AuthCallbackPage.jsx` → `useAuthCallback()` hook に抽出

**フェーズ C（低優先、Admin）**
- [ ] Admin ページ群は量が多いため、最低限 `try/catch + logError` で包む
- [ ] 将来的に `useAdmin*` hooks に移行する設計方針を docs に記載

---

## CQ-004: ハードコード文字列の定数化

### 問題

エラーメッセージ・localStorage キー・設定値が散在しており、変更時に複数箇所の修正が必要。

### 対象箇所

| ファイル | 内容 |
|---------|------|
| `src/hooks/usePostForm.js` | エラーメッセージ文字列・`'zarigani_submit_timestamps'` キー |
| `src/hooks/useStats.js` | `'zaridasu_stats_${months}_...'` キャッシュキー |
| `src/pages/AuthCallbackPage.jsx` | エラーメッセージ5箇所 |
| `src/components/features/map/LocationPicker.jsx` | Leaflet CDN URL |
| `src/components/features/map/MapView.jsx` | 秋田県緯度経度（既存 `AKITA_CENTER` があるのに再定義） |
| `src/hooks/useDeletePost.js` | `'削除に失敗しました。'` |
| `src/hooks/useEditPost.js` | `'保存に失敗しました'` |

### 受け入れ条件

- [ ] `'zarigani_submit_timestamps'` を `constants.js` の `SPAM_KEY` として定数化する
- [ ] `'zaridasu_stats_...'` を `STATS_CACHE_KEY_PREFIX` として定数化する
- [ ] `MapView.jsx` の緯度経度ハードコードを既存の `AKITA_CENTER` に置き換える
- [ ] エラーメッセージは i18n (`t()`) 対応を行う（CQ-006 参照）か、定数ファイルにまとめる

---

