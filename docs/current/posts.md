# 投稿（posts）— いまの仕様

> **この文書の位置づけ**: 「いま何が正しいか」だけを書く。「そのとき何を変えたか」は `docs/requirements/REQ-*.md`（履歴）にある。
> 食い違ったら**コードが正**。各節の末尾に正本のファイルを書いてある。

## 何ができるか、誰が

| 操作 | できる人 |
| --- | --- |
| 閲覧 | 誰でも（承認済みのみ）。自分の投稿は status を問わず見える。管理者は全部見える |
| 投稿 | **ログインした人だけ**（アカウント無しの投稿は廃止済み） |
| 編集・削除 | 投稿した本人と管理者 |
| 承認・却下 | 管理者だけ |

RLS がこれを担保している（`moderated_read` / `auth_insert` / `owner_update` / `owner_delete` / `admin_all_posts`）。アプリ以外の経路から触られても同じ。正本: `supabase/schema.sql`

## 審査

投稿は `pending` で入り、管理者が `approved` か `rejected` にする。**「不在確認」（`info_type = 'absence'`）も同じで、自動承認にはならない。** 画面側の `resolvePostStatus`（`src/lib/post/postFields.ts`）は不在確認を `approved` で送るが、管理者以外の INSERT ではトリガー `protect_post_insert_columns` が `status` を `pending` に戻す。そのまま `approved` で入るのは管理者の投稿だけ。正本: 最新の `protect_post_insert_columns`（`supabase/migrations/20260926000001_req329_owner_location_privacy_private_spots.sql`）

**利用者は自分で status を書き換えられない。** RLS だけでなく `protect_post_status` トリガーが `status` / `rejection_reason` / `rejection_message` / `reviewed_at` / `reviewed_by` を旧値へ戻す。管理者以外の UPDATE は、この 5 列に関しては無視される。正本: `supabase/schema.sql`

承認・却下では `reviewed_at` と `reviewed_by` を必ず一緒に書く。組み立ては `src/lib/data/posts-admin.ts` が持つ。

## 座標の扱い（ここが一番壊れやすい）

**生の `lat` / `lng` は anon / authenticated から列 GRANT で剥奪してある。** select にも WHERE にも書けない。書くと実行時に落ちる。

公開用には生成列 `display_lat` / `display_lng` があり、`location_disclosure` で決まる：

| location_disclosure | display_lat / display_lng |
| --- | --- |
| `precise` | 生値そのまま |
| `coarsened`（既定） | 小数第 3 位に丸める（約 111 m グリッド） |
| `hidden` | NULL |

`hidden` が NULL になるおかげで、範囲比較から自然に外れて地図に出ない。**この性質に頼っている箇所がある**ので、NULL を別の値で埋めないこと。

既定値は種ごとに決まる。**投稿者ができるのは `hidden`（位置を非公開）にすることだけ**で、投稿時にも投稿後にも選べるが一方向（REQ-329）。公開へ戻す・精度を上げる（precise）は管理者とサービスロールだけ。だから管理者が伏せた記録を投稿者が戻すことは起きない。正本: `protect_post_insert_columns` / `protect_post_status`

**hidden の間は字名・水系名（`locality` / `water_body`）も公開列から外れる。** トリガー `zz_stash_hidden_post_geo` が管理者専用の `post_hidden_geo` へ退避して公開列を NULL にし、公開へ戻すと復元する（「〇〇沼」で場所が分かるため）。退避テーブルの行を手で消すと、公開へ戻したときに地名が戻らない。

**所有者だけは自分の投稿の正確座標を見られる**が、それは列からではなく `get_my_post_location` RPC 経由。`DetailPage` が取得して表示を上書きする。

正本: `supabase/schema.sql`（生成列と GRANT）・`src/lib/data/posts.ts`（select の組み方）

## 公開の定義

**公開＝`status = 'approved'`。** この判定は `src/lib/data/posts.ts` の `PUBLIC_POST_STATUS` ひとつだけが持つ。直書きの `'approved'` を増やさないこと。

`lib/data/` の外で `.from('posts')` を書くと ESLint が止める（移行が済んでいないファイルだけ `eslint.config.js` の除外リストにある）。

## 書き込みで必ず守ること

**`UPDATE` / `DELETE` は RLS で拒否されてもエラーにならず、0 行更新で「成功」として返る。** 影響行数を数えない限り、権限が無いのに「承認しました」と表示される。`src/lib/data/posts-admin.ts` と `posts-write.ts` の関数はすべて `.select('id')` を付けて 0 行なら投げる。**新しい書き込みを足すときも必ず同じ形にすること**（2026-09-14 に 5 箇所直した）。

**投稿フォームの下書きと、圏外で保存した投稿の下書きは、利用者ごとに分ける。** 入力中の下書き（localStorage）は利用者 ID 入りのキーに置き、ログアウトと退会で消す。地点（調査計画・ピン・非公開スポット）から開いたフォームは下書きを読まず書かない。圏外の下書き（IndexedDB）は保存した利用者の ID を持ち、表示と送信は今の利用者の分だけ。保存の上限（10 件）も利用者ごとに数える。利用者で分ける前の版（ID なし）は持ち主が分からないので勝手には送らず、マイページで中身（種・日付・写真）を見せ、確認を挟んで「自分のものとして送る」か破棄を選べるようにした（同じ端末の前の人の位置や写真を、黙って次の人の名義で送らないため）。入力中の下書きの持ち主はフォームを開いた時点で決め、別のタブで利用者が替わったら保存しない。調査計画の地点から作った圏外の下書きは、送るときに近くの希少種を確かめ直す（[fieldwork.md](./fieldwork.md)）。正本: `src/hooks/posts/usePostDraft.ts`・`src/hooks/useOfflineQueue.ts`・`src/lib/offlineSend.ts`

**新しい投稿の INSERT は `posts-write.ts` の `insertPost` だけを通す。** 行は `buildPostInsertRow` が組み立てるので、通常の送信と、圏外で保存した下書きの再送は同じ列の組を送る（再送の `experiment_assignments` は再送した時点の割付）。行を 2 か所で手書きしていた頃は、再送の側だけ `image_hashes` と `experiment_assignments` が抜けていた（REQ-331 で修正）。列を足したら `src/lib/data/__tests__/posts-write.insert.test.ts` の列の一覧にも足す。

## 写真・音声

写真は**保存前に EXIF を除去**し、長辺 1280 px へリサイズして JPEG 化する（撮影位置が写真から漏れるため）。正本: `src/lib/imageProcessor.ts`

投稿を削除しても、**Storage の写真・音声の実体は自動では消えない**。参照が消えるだけなので、削除処理を書くときは呼び出し側で Storage も消す。

## 詳細ページの列が 2 箇所にあるのは意図的

`/post/[id]` の列定義は 2 つあり、**サーバ側だけ `locality` / `water_body` / `is_on_water` / `elevation_m` を余分に取る**。これは JSON-LD（Dataset / Place の構造化データ・REQ-229）の素材で、画面では使わない。**統一すると SEO 側が壊れる**ので、揃えないこと。

- サーバ（SSR・構造化データ用）: `src/app/post/[id]/page.tsx` の `POST_DETAIL_COLUMNS`
- クライアント（画面用）: `src/lib/data/posts.ts` の `selectPostDetailById`

## 触ってはいけないもの

- **`is_anonymous` は「表示を匿名にするか」**であって、アカウント無しで投稿できるという意味ではない（投稿は要ログイン）。作者名を出すかどうかの分岐に使う。**後から変えられない**（トリガーが旧値へ戻す）
- **公開データセット（`/dataset`）の列構成**は配布済みデータの契約。アプリ内 CSV 出力とは列が違う（あちらは天候・気温、こちらは locality・water_body）。どちらかに寄せない
- **適用済みの migration は編集しない。** version が同じだと二度と流れず、リポジトリと本番が乖離したまま CI は緑になる

## 関連

- 管理・審査の実装 — `src/lib/data/posts-admin.ts`
- 新規投稿・利用者の編集・削除 — `src/lib/data/posts-write.ts`
- 公開読み取り — `src/lib/data/posts.ts`
- 名前付きの非公開保存（クイック保存）は posts ではなく `private_spots`（本人と管理者だけ）— `src/lib/data/private-spots.ts`
- 履歴（そのとき何を変えたか） — `docs/requirements/`。座標は REQ-243・REQ-329、審査は REQ-004 まわり
