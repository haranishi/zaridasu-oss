## 機能要件

- **FR-308-01**: `PhotoGallery.tsx:76-109` の描画を間引く。第一候補として**カードに `content-visibility: auto` ＋ `contain-intrinsic-size`（`aspect-square` の実寸に対応する値）を付与**する。これで不足する場合は**初期 100 件 ＋ IntersectionObserver による段階追加**へ進む。いずれの方式でも `items.length` を使う件数表示（`:73`）は全件の値を維持する。
- **FR-308-02**: `PhotoGallery.tsx:104` の `format(new Date(post.created_at), 'M/d')` を、**モジュールスコープで再利用する `Intl.DateTimeFormat` インスタンス**、または文字列スライスへ置き換える（表示は `M/d` のみ）。ローカル日付の扱いは REQ-272（ローカル日付の一貫性）の方針に反しないことを確認する。
- **FR-308-03**: ホームの取得件数の段差（50 ⇄ 2000）を解消する。次のいずれかを選び、決定と根拠を本ファイルに追記する。
  - **(a) `fetchMore` を配線する**: `HomePage.tsx:118` で `hasMore` / `loadingMore` / `fetchMore` を受け取り、PhotoGallery（および必要なら MapGalleryPager）へ渡して sentinel で追加読込する。`PostList.tsx:110-125` の既存実装が手本になる。
  - **(b) 責務を分離する**: **地図は「表示範囲＋上限」で取得し、ギャラリーはページングで取得する**。地図と一覧が同じ `posts` 配列を共有している現構造を分ける。
  - どちらを採る場合も、**表示範囲フィルタ OFF の既定状態で最新 50 件しか見えないという現状を解消すること**を必須要件とする。
- **FR-308-04**: `PostList.tsx` / `PostCard.tsx` / `StatsBar.tsx` の扱いを FR-308-03 の決定に合わせて確定する。(a) を採るなら `PostList` の sentinel 実装を再利用／復活させる。(b) や PhotoGallery 側への実装で不要になるなら**削除する**（併せて `imageUtils.toThumbnailUrl` と `next.config.ts` の `render/image` remotePattern も未使用になるため撤去を検討する）。**「dead code のまま放置」は不可**とし、どちらかに決める。復活させる場合は `PostCard.tsx:80-84` の不整合（`toThumbnailUrl(..., 400)` で 400px 固定 URL を作りながら `sizes="(max-width:640px) 100vw, ..."` を指定＝モバイルで 400px ソースから 640/750/828px の srcset を生成するアップスケール）も同時に直す。
- **FR-308-05**: `AdminReportsPage.tsx:103-107` に `.range(page * ADMIN_PAGE_SIZE, page * ADMIN_PAGE_SIZE + ADMIN_PAGE_SIZE - 1)` とページング UI を追加し、**他の管理画面（`useAdminPosts` / AdminComments / AdminLogs）と同じ `ADMIN_PAGE_SIZE = 20` の流儀に統一**する。`tab` 切替時に `page` を 0 に戻すこと。
- **FR-308-06**: `AdminReportsPage` の `select('*')` を**実際に描画・集計に使う列へ明示**する（`reporter_ip` は `:113-116` の `ipCountMap` に必要なので残すが、それ以外の未使用列は落とす）。**PII 露出面の縮小も兼ねる**。
- **FR-308-07**: `get_admin_user_list()` に **`p_limit` / `p_offset` / 検索語パラメータを追加**する（既存のシグネチャを壊さないよう既定値付き、または新関数として追加してから移行する）。`AdminUsersPage.tsx:221` を `ADMIN_PAGE_SIZE = 20` 単位のページング＋検索に対応させる。`SECURITY DEFINER` と JWT の admin チェック（`schema.sql:725-727`）は必ず維持する。`npm run schema:check` がパスすること。
- **FR-308-08**: `AdminLogsPage.tsx:70` の名前解決用途に、**「表示中のログに含まれる `user_id` のみを email へ解決する軽量 RPC」を分離**する（`p_user_ids uuid[]` を受ける形）。全件 RPC の呼び出しをやめる。
- **FR-308-09**: `AdminUsersPage.tsx:312` と `:386` の **2 重 `users.map` を 1 系統に統合**する（CSS のレスポンシブ制御でカード／テーブルの見た目を出し分け、DOM 上の行は 1 セットにする）。モバイル・PC 双方の表示と操作（ロール変更ボタン、`isSelf` の無効化、`isProcessing` の状態表示）が従来どおり機能すること。
