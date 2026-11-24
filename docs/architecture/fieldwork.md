# 現地調査は個人の計画と公開記録を分けてつなぐ

「予定を組む → 地点へ行く → いた／いなかった／希少種を記録する」を[src/features/fieldwork](../../src/features/fieldwork/README.md)にまとめている。
画面の詳しい挙動は[現行仕様](../current/fieldwork.md)、地図への差し込みは[map-posts](map-posts.md)、端末保存全体は[offline](offline.md)にある。

## 4表を公開投稿の経路から分離する

| 表 | 役割と寿命 |
| --- | --- |
| `survey_plans` | 日付付きの計画。active／done／archivedで管理 |
| `survey_plan_stops` | 地点の複製座標、順序、pending／done／skipped、訪問時刻。元の場所の削除で壊さない |
| `survey_stop_posts` | 自分の地点と自分の投稿をつなぐ。主キーは地点＋投稿、UPDATEを許さない |
| `rare_sightings` | 希少種の正確位置・観察・写真パス。地点を消してもstop_idをNULLにして残す |

[REQ-330 migration](../../supabase/migrations/20261001000001_req330_fieldwork.sql)が4表と非公開写真を定義する。anonにはGRANTを与えず、本人と管理者が読める。INSERT／UPDATEは本人の分、DELETEは本人と管理者に限る。
地点の親計画と、つなぐ投稿の所有者もWITH CHECKで確認する。user_id・client_id・created_atなどは保護トリガーで変えさせない。
元のスポットを参照するsource_idは外部キーにせず、地点に座標を持つ。地点削除ではリンクを消すが、希少種の記録は残す。
並べ替えRPCはSECURITY INVOKERで、対象計画の全地点を受け取ってまとめて更新する。一部だけの並べ替えを送らない。

## データ・状態・表示の責任を分ける

| 場所 | 変更するときに見る内容 |
| --- | --- |
| [data](../../src/features/fieldwork/data) | DB／Storage操作、0行検出、再送、既存投稿の非公開化 |
| [lib](../../src/features/fieldwork/lib) | 位置の規則、300mの距離計算、経路の分割、送信待ち、控え、エラー分類 |
| [hooks](../../src/features/fieldwork/hooks) | 計画・地点・希少種・送信待ちを画面の状態へ変換 |
| [components](../../src/features/fieldwork/components) | 地図の入口、遅延読込の本体、パネル、記録シート、ログアウト前の確認 |
| [admin](../../src/features/fieldwork/admin) | 運営向けの非公開一覧とCSV |

`FieldworkLayer`は地図と共に読む小さい入口で、`FieldworkSession`・シート・投稿フォームは操作時に動的importする。
認証の共通チャンクから読む[localData](../../src/features/fieldwork/lib/localData.ts)は他モジュールをimportしない。端末データの片付けのために地図本体を全ページへ読み込まない構造である。
地図・ピン・非公開スポットからの依頼は`lib/bridge`と`PopupActions`を通す。アカウント切替では利用者idのkeyでセッション本体を作り直す。

## 希少種の保護は地点idではなく場所から判断する

記録から300m以内の本人の地点・投稿は位置をhiddenにする。同じ計画の再利用で地点idが変わっても、別端末で記録しても保護を継続するためである。
[rareSightings](../../src/features/fieldwork/data/rareSightings.ts)は周辺を範囲検索して距離を確認する。取得失敗・検索上限1000件で欠落が疑われる場合は伏せる側へ倒す。
投稿の直前と圏外下書きの再送時にも確認する。通信失敗は送信待ちに残し、それ以外の確認不能はhiddenとして進める。
後から希少種を記録したら[protect](../../src/features/fieldwork/data/protect.ts)が近くの地点に結び付く本人の投稿を非公開にする。通信失敗は保護作業も送信待ちへ残す。他人の投稿は対象外である。
この保護はアプリの投稿・再送経路に組み込んだ処理で、DBの全投稿に対する自動的な空間制約ではない。新しい投稿経路を追加するときも呼び出す必要がある。

「希少種あり」の印は本人が表示をONにしたときだけ見せ、保護そのものは表示状態に関係なく効かせる。画面写真からの位置漏れも避けるための仕様である。
位置非公開の不在記録で市町村を逆引きするときは、小数2桁に丸めた座標を外部へ送る。
[positionRule](../../src/features/fieldwork/lib/positionRule.ts)は誤差100m以内かつ地点から300m以内の現在地を採用し、それ以外は地点の座標を使う。どちらを使うかは記録前に表示する。

## 不在記録は複数の操作なので途中から再開する

[absence](../../src/features/fieldwork/data/absence.ts)は選んだ種ごとに不在投稿を`insertPost`で作り、地点とのリンクを付け、最後に地点をdoneにする。survey_methodはstructured。
一般利用者はDBでpendingとなり、不在だから自動公開されるわけではない。24時間5投稿の上限にも数える。
種の一方だけ作成できた場合は、返ったpost idを送信待ちへ即保存し、再送ではそのidを使って続きを進める。
postsにはclient_idが無いため、INSERTは成立したのに応答だけ失われた場合には再送で重複する余地が残る。
希少種は`(user_id, client_id)`、地点リンクは主キーで重複を抑える。地点が削除・権限変更されていたら、希少種は地点を外して保存し直し記録を残す。

| 通常利用者のDB上限 | 件数 |
| --- | --- |
| 計画作成 | 24時間30件、保有1000件 |
| 地点追加 | 1時間300件、1計画100地点 |
| 希少種記録 | 1時間60件、保有5000件 |

管理者は上限を迂回する。DBのP0001と文言を`lib/errors`で分類し、通信障害と同じ再送メッセージにしない。

## 圏外の控えと送信待ちは利用者ごとに持つ

計画の控えはlocalStorageの利用者id付きキーに「最後の同期内容」として保存し、圏外では編集しない。
[queue](../../src/features/fieldwork/lib/queue.ts)は不在・地点状態・写真なし希少種・リンク・保護の作業を持ち、送信前に読み直して他の送信が消した項目を送らない。
[sendQueued](../../src/features/fieldwork/data/sendQueued.ts)が種類別に再開する。「いた」の大きな下書きはIndexedDB側で管理し、[offlinePost](../../src/features/fieldwork/data/offlinePost.ts)が保護と地点リンクを後処理する。
リンク後処理に失敗しても作成済み投稿を再作成しない。通信失敗ならlink項目を積み、地点消失などなら投稿を残して関連付けを省略する。
端末保存はアプリの利用者分離であり、端末自体の暗号化保管を提供する仕組みではない。

## 非公開写真とログアウトは部分完了を明示する

[rarePhotos](../../src/features/fieldwork/data/rarePhotos.ts)は自分のフォルダへEXIF除去済みJPEGだけを上げ、最大3枚・各5MB、表示は1時間の署名URLに限る。EXIFを落とせなかった元ファイルは送らない。
記録行の削除と写真の削除は別操作で、残った写真数を画面へ返す。退会前は写真を一覧して消し、通信・権限・回数上限で消し切れなければ退会を止める。置き場自体が無い環境は例外扱いにする。
写真削除後に退会が失敗した場合も「写真は削除済み」と伝える。[AuthContext](../../src/context/AuthContext.tsx)がこの順序と端末の後片付けを担う。
ログアウト前は未送信件数を示し、送る／破棄して終える／やめるを選ぶ。ログアウト失敗時はfalseを返しデータを残し、破棄は成功後に行う。

検証は[データ層テスト](../../src/features/fieldwork/data/__tests__)・[フックテスト](../../src/features/fieldwork/hooks/__tests__)・[E2E](../../tests/e2e/fieldwork.spec.ts)・[SQL権限テスト](../../supabase/tests/rls_req330_fieldwork.sql)・`private-tables:check`を使う。
公開RPC・ビュー・route・Edgeに4表やrare-photosが混入しないことも検査する。実Storageの署名URLや権限設定は単体テストだけで確認できず、今回の文書化でも本番操作は行っていない。
