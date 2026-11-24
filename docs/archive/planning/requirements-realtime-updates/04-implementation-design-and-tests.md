## 実装設計

### 新規ファイル

| ファイル | 内容 |
|---------|------|
| `src/hooks/useRealtimePosts.ts` | 投稿テーブルの Realtime 購読フック |
| `src/hooks/useRealtimeComments.ts` | コメントテーブルの Realtime 購読フック |
| `src/hooks/useRealtimeLikes.ts` | いいねテーブルの Realtime 購読フック |
| `src/components/ui/NewPostsBanner.tsx` | 「新しい投稿があります」バナー |

### 変更ファイル

| ファイル | 変更内容 |
|---------|---------|
| `src/pages/HomePage.jsx` | `useRealtimePosts` を組み込み。新着バナー表示ロジック追加 |
| `src/hooks/usePostList.ts` | Realtime イベントで posts ステートを更新するコールバックを公開 |
| `src/components/features/posts/CommentSection.jsx` | `useRealtimeComments` で他ユーザーのコメントを即反映 |
| `src/components/features/posts/LikeShareSection.jsx` | `useRealtimeLikes` でいいね数をリアルタイム更新 |
| `src/pages/admin/AdminLayout.jsx` | 承認待ちバッジのリアルタイム更新 |

---

## 実装前の準備作業（コード不要）

1. **Supabase ダッシュボード → Database → Replication** で以下のテーブルの Realtime を有効化:
   - `posts`（INSERT, UPDATE, DELETE）
   - `comments`（INSERT, DELETE）
   - `likes`（INSERT, DELETE）
2. RLS ポリシーが Realtime にも適用されることを確認（承認済み投稿のみ配信される）

---

## テスト観点

1. 投稿が承認された時に、別ブラウザタブで地図表示中のユーザーにマーカーが追加されること
2. コメントが投稿された時に、同じ詳細ページを開いている別ユーザーに即反映されること
3. 「新しい投稿があります」バナーが表示され、タップで更新されること
4. バナーをタップせずに閉じた場合、次のイベントでカウントが累積すること
5. ページ離脱時にチャネルが確実に unsubscribe されること（メモリリークしない）
6. タブがバックグラウンドになった時に unsubscribe、復帰時に再接続 + 差分取得されること
7. ネットワーク切断→復旧後に Realtime が自動再接続し、見逃したデータが取得されること
8. 管理画面の承認待ちバッジが投稿追加/承認でリアルタイムに増減すること

---
