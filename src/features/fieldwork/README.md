# fieldwork — 調査計画と希少種の非公開記録（REQ-330）

調査の日を「計画する → 案内される → 地点ごとに結果を残す」の一続きにする機能のフォルダ。このファイルは後から辿るための案内板で、仕様の「いま」は [docs/current/fieldwork.md](../../../docs/current/fieldwork.md) に書いてある。

## 4 つの表は本人と管理者にしか開かない

| 表 | 何が入るか | 主な制限 |
| --- | --- | --- |
| `survey_plans` | 計画（題名・予定日・状態・メモ） | 1 日 30 件・1 人 1000 件 |
| `survey_plan_stops` | 計画の地点。座標は複製して持つ | 自分の計画にだけ足せる。1 計画 100 か所・1 時間 300 件 |
| `survey_stop_posts` | 地点と投稿のつながり | 地点も投稿も自分のもの。作るか消すかだけ |
| `rare_sightings` | 希少種の記録 | `client_id` で二重登録を弾く。写真は自分のフォルダのものだけ。1 時間 60 件・1 人 5000 件 |

写真は非公開の置き場 `rare-photos` に置き、1 時間の署名 URL で見せる。正本は `supabase/migrations/20261001000001_req330_fieldwork.sql`。

## 中の分け方

| フォルダ | 持つもの |
| --- | --- |
| `data/` | DB と写真置き場の関数。UPDATE と DELETE は 0 行なら例外（RLS の拒否も 0 行の成功で返るため）。`absence.ts` は不在の投稿を `posts-write.ts` の `insertPost` で作る（3 本目の INSERT を書かない）。`sendQueued.ts` は送信待ちの送り手、`protect.ts` は記録の近くの投稿を非公開にする、`flushBeforeSignOut.ts` はログアウト前の送信、`offlinePost.ts` は圏外で下書きに入った「いた」を送るときの保護と地点とのつなぎ（`src/lib/offlineSend.ts` から読む） |
| `lib/` | 区切り方（`routeSegments`）・位置の規則（`positionRule`）・希少種の近さ（`rareProximity`。300 m）・送信待ち（`queue`）・計画の控え（`planCache`）・端末の保存先と片付け（`localData`。AuthContext が静的に読むので何も import しない）・予定日（`planDate`。16 時以降は明日）・失敗の振り分け（`errors`）・吹き出しからの依頼（`bridge`） |
| `hooks/` | `useFieldworkPlan`（計画と地点）・`useRareSightings`（希少種の記録）・`useFieldworkQueue`（送信待ちの送信） |
| `components/` | `FieldworkLayer`（地図の入口。ボタンと吹き出しの受け口だけで、地図と一緒に全員に配られる）・`FieldworkSession`（本体。地点の丸・地図で選ぶ・パネルとシートの出し入れ。使うときにだけ読む）・`FieldworkPanel`（`PlanTab` `StopList` `SpotPicker` `RareTab`）・`StopSheet`・`AbsenceConfirm`・`RareSightingSheet`・`PopupActions`・`SignOutUnsentDialog`（ログアウト前の確認。AuthContext が必要なときだけ読む）・共通の部品 `parts` |
| `admin/` | `AdminRareSightingsView`（運営の一覧と CSV） |

呼ぶ側が知っておくことは 6 つある。

- 「希少種あり」（位置を非公開にする判定）は地点の id でなく場所（記録から 300 m 以内）で決める。投稿を作る直前にも `hasOwnRareNear` で DB に確かめる
- 「希少種あり」の印を画面に出すのは「希少種を自分の地図に表示」を入れたときだけ。部品には `showRare` を渡す
- 送信待ちを再送しても増えない。希少種は `client_id`、つながりは主キー、不在の投稿は送れた投稿の id を項目に書き残して作り直さない
- 記録を消しても写真の実体は残る。`deleteRareSighting` が返すパスを `removeRarePhotos` に渡す（`useRareSightings.remove` がやっている）
- `uploadRarePhoto` は EXIF（撮影位置）を消せなかった写真を送らず、例外にする。退会の前は `removeAllOwnRarePhotos` で全部消す
- `reorderStops` には計画の地点を全部渡す。一部だけだと DB が拒否する

## ほかの場所への差し込み口（機能を外すときに触る場所）

| 場所 | 足したもの |
| --- | --- |
| `src/components/features/map/MapView.tsx` | `<FieldworkLayer key={user?.id ?? 'signed-out'} … />` の 1 行と import。key でアカウント切替のときに作り直す |
| `src/components/features/map/MapActionStack.tsx` | `MAP_ACTION_ORDER.fieldwork`（右下の列のいちばん上） |
| `src/components/features/map/PersonalMapLayer.tsx` | ピンと非公開スポットの吹き出しに `components/PopupActions`（「計画に入れる」「希少種を記録」）。`lib/bridge.ts` のイベントで頼むだけ。「ここで投稿」の前に `map/postLock.ts`（中で `hasOwnRareNear` を動的 import）で保護を確かめる。圏外・確かめられなければ非公開に固定 |
| `src/components/features/map/MapTopSlot.tsx`・`MapView.tsx`・`src/views/HomePage.tsx` | 地図のすぐ上の帯の置き場（スマホの「希少種を表示中」の帯。地図を下げて印を隠さない）。ホームの「地図／写真」の切り替えは地図の外に重ねてあるので、置き場の高さ（CSS 変数 `--zari-map-top-slot`）だけ下げる。下げないと帯の文字の上に重なる |
| `src/components/features/posts/PostForm.tsx` | props `surveyMethod`（structured）と `lockedPrivateReason`（位置の非公開を固定して理由を 1 行出す）。地点から開いたら下書きを読まず書かない |
| `src/context/AuthContext.tsx` | ログアウトで控えと下書きを消し、送信待ちがあれば確認を出す。`signOut()` は「やめる」・失敗で false を返す。退会で写真と端末の分を全部消す。**ここから通知（`ToastContext`）を静的に読まない**＝共通チャンクの分かれ方が変わってホームのページの JS が予算 10 kB を超えた（2026-10-02 実測 10.89 kB）。失敗の通知は `components/ui/SignOutFailedNotice` を失敗したときだけ読む |
| `src/views/admin/AdminLayout.tsx` | ナビに「希少種の記録」1 項目 |
| `src/app/admin/(protected)/rare-sightings/page.tsx` | `admin/AdminRareSightingsView` の再 export |
| `src/locales/*/translation.json` | `fieldwork.*`（4 言語） |

本体（パネルを含む）とシート・投稿フォームは押したときに `next/dynamic` で読む。ホームのページ JS と地図のチャンクを重くしない（バレル禁止。import は実体のファイルを直に指す）。

## 希少種を足すなら constants.ts に 1 行

`RARE_SPECIES` に 1 行、翻訳 4 言語の `fieldwork.rareSpecies.*` に名前を足せば済む。DB は key の形式しか見ないので migration は要らない。既存の key の綴りは変えない（保存済みの記録に残っている）。

## 検査は 5 か所。pg-tap だけは CI でしか回らない

| 何を確かめるか | どこで |
| --- | --- |
| 権限・制約・上限・写真置き場（pg-tap） | `supabase/tests/rls_req330_fieldwork.sql`（CI の rls-tests） |
| データ層・区切り方・位置の規則・送信待ち・フック・画面の部品 | 各フォルダの `__tests__/`（画面の部品は本物の i18next で描画） |
| 計画→地点 3 つ→並べ替え→まとめて開く→いなかった→希少種→アカウント切替 | `tests/e2e/fieldwork.spec.ts` |
| 公開の経路に 4 表が出ていないか | `npm run private-tables:check` |
| 列挙値と型の一致 | `npm run schema:check` |
