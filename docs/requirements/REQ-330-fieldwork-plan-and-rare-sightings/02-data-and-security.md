# REQ-330 §2 データと権限：新しい4表と写真置き場は、本人と運営にしか開かない

migration は1本（`2026100100xxxx_req330_fieldwork.sql`）にまとめ、`schema.sql`・`database.types.ts`・`check-schema-types-sync.ts` を同期する。権限の型は `private_spots`（REQ-329）をそのまま写す。SELECT は本人か管理者、INSERT・UPDATE は本人、DELETE は本人か管理者に許す。`REVOKE ALL ... FROM PUBLIC, anon` を必ず書き、anon には GRANT 自体を付けない。管理者の判定は private_spots と同じ式（JWT の app_metadata.role）を使う。

## 表

| 表 | 持つもの | 主な制約 |
|---|---|---|
| `survey_plans` | 計画（題名・予定日・状態・メモ） | 題名1〜60字、状態は active / done / archived、予定日の既定は日本時間の今日 |
| `survey_plan_stops` | 計画の地点（順番・名前・メモ・座標・出どころ・状態・訪れた時刻） | 1計画100地点まで。出どころ（pin / private_spot / survey_request / current_location）と元の id。状態は pending / done / skipped。座標は複製して持つので、元のスポットを消しても計画は壊れない |
| `survey_stop_posts` | 地点と投稿のつながり（種類は sighting / absence） | 主キーは（地点, 投稿）。地点も投稿も自分のものに限る |
| `rare_sightings` | 希少種の記録（種・数・メモ・座標・精度・位置の取り方・観察日時・写真のパス・地点） | 下記 |

`rare_sightings` の決まり：

- `species_key` は形式だけ検査する（`^[a-z][a-z0-9_]{0,39}$`）。一覧はコードの定数1か所に置く。`other` のときは `species_label`（1〜60字）を必須にする
- `client_id`（端末で作る uuid）を必須にし、`UNIQUE (user_id, client_id)` で同じ送信の二重登録を DB で弾く。REQ-329 の非公開スポットは DB に重複を弾く鍵がなく、応答が途切れたあとの再送で2行入りうる（9/27 の確認）。同じ穴を作らない
- 写真のパスは3つまで。どれも `<自分の user_id>/` で始まることをトリガーで検査する（他人の写真を自分の記録に結び付けさせない）
- 観察日時は「今から1日後」より未来を拒否する。数は0〜100000

UPDATE では `user_id`・`client_id`・`created_at`（地点では `plan_id` も）を旧値に戻すトリガーを付ける（`protect_private_spot_columns` と同じ形）。地点の INSERT は「その計画が自分のもの」、つながりの INSERT は「地点も投稿も自分のもの」を WITH CHECK で確かめる。

## 写真置き場 `rare-photos`

- `public = false`。大きさは5MBまで、種類は jpeg / png / webp
- storage.objects のポリシーは、INSERT がパスの1段目が自分の uid のときだけ、SELECT と DELETE が自分のフォルダか管理者、UPDATE は付けない
- 表示は `createSignedUrl`（1時間）で行い、公開URL（`getPublicUrl`）は使わない
- アップロード前に既存の `lib/imageProcessor.ts` で EXIF（撮影位置）を消す。非公開の置き場でも、管理者の端末に保存された写真から位置が漏れうるため

`post-photos` は誰でも一覧できる設定（schema.sql の `public_read_photos`）なので、希少種の写真は絶対にそこへ置かない。

## 上限（管理者は対象外）

| 対象 | 上限 | 理由 |
|---|---|---|
| 計画 | 1日30件・1人1000件 | 誤操作の連打と大量作成を止める |
| 地点 | 1時間300件・1計画100件 | 計画の作り直しは許しつつ暴走は止める |
| 希少種の記録 | 1時間60件・1人5000件 | 非公開スポットと同じ考え方 |

投稿の上限（24時間5件）は今回変えない（本体の「未決の論点」を参照）。

## 検査（pg-tap と CI）

`supabase/tests/rls_req330_fieldwork.sql` に、少なくとも次を書く。

- 4表とも、anon は `has_table_privilege` が偽で、SELECT は 42501 で失敗する
- 本人は自分の行を読み書きでき、他人の行は0行に見える。他人の計画へ地点を足せない。他人の投稿をつなげない
- 管理者は全員分を読める。本人は `user_id` や `client_id` を書き換えられない
- `other` で `species_label` が空なら拒否する。同じ `client_id` の2回目は一意制約で拒否する。他人のフォルダの写真パスを拒否する
- 上限の境目（1時間60件目は通り、61件目は拒否）

CI のテスト用 DB には storage スキーマが無く、写真置き場のポリシーはこれまで検査できなかった。`supabase/ci/` に最小の storage の代役（buckets・objects・foldername）を足し、`rare-photos` のポリシーも pg-tap で確かめる。足せない事情が出たら、本番適用の直後に「別アカウントで他人の写真を読めない」ことを手で確かめる手順を runbook に書く。

## 公開経路に届かないことの見張り

anon が実行できる関数の本文に、新しい4表の名前が出てこないことを CI で検査する（`supabase/schema.sql` と migrations を対象にした grep）。集計 RPC に誰かが希少種を足したとき、ここで止まる。
