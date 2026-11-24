### F3: いいねのリアルタイム更新（DetailPage）

**対象チャネル**: `likes` テーブルの `INSERT` / `DELETE`（`filter: post_id=eq.{postId}`）

**動作仕様**:
- いいね数のカウントがリアルタイムで増減
- 自分の操作は既存フローで即反映済みのため、カウント二重更新しない

### F4: 管理画面の承認待ち件数バッジ（AdminLayout）

**対象チャネル**: `posts` テーブルの `INSERT` / `UPDATE`（`filter: status=eq.pending`）

**動作仕様**:
- サイドバーの「投稿管理」メニューに承認待ち件数バッジを表示
- 新しい pending 投稿が入った → バッジ数増加
- 承認/拒否された → バッジ数減少

### F5: 接続状態の表示

- Supabase Realtime の接続状態（connected / reconnecting / disconnected）を監視
- 切断時はトースト通知:「リアルタイム接続が切れました。再接続中…」
- 再接続成功時に差分データを再取得（楽観的ではなく、サーバーの最新データでリフレッシュ）

---

## 非機能要件

| 項目 | 要件 |
|-----|------|
| コスト | Supabase Free プラン: Realtime は 200 同時接続まで無料 |
| レイテンシ | イベント配信は通常 100-500ms（Supabase Realtime の標準性能） |
| 帯域 | チャネルは必要なテーブル・フィルタのみ subscribe（全テーブル監視しない） |
| 接続管理 | ページ離脱時に `removeChannel()` で確実にクリーンアップ |
| バックグラウンドタブ | `visibilitychange` イベントでタブ非表示時は unsubscribe、表示時に再 subscribe + 差分取得 |
| Supabase 設定 | Realtime を有効にする（Supabase ダッシュボード → Database → Replication で `posts`, `comments`, `likes` を有効化） |

---
