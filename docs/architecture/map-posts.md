# 地図・一覧・非公開スポット

基点：`6070714870e5`。投稿の公開条件と座標の正本は [posts](../current/posts.md)・[privacy](../current/privacy.md)。

## ホームで見える記録を決める

[HomePage](../../src/views/HomePage.tsx) はフィルタをstate、フォーム・認証・表示範囲をreducerで持つ。
投稿取得は [usePostList](../../src/hooks/posts/usePostList.ts)、調査依頼取得は [useSurveyRequests](../../src/hooks/survey/useSurveyRequests.ts) に委ねる。
検索は初回を即時、次から300ms待って確定する。範囲フィルタが無効なら地図移動を取得条件から外し、パンのたびに再取得しない。
フィルタ値の入力UIは [FilterBar](../../src/components/features/dashboard/FilterBar.tsx)。詳細フィルタの段階解放は [参加UI](participation.md) を参照する。

usePostListは [公開読み取り](../../src/lib/data/posts.ts) を起点に、期間・地域・種・情報種別・検索・粗化座標の範囲を足す。
PostgRESTの検索文字列は [postgrest](../../src/lib/postgrest.ts) でエスケープし、入力から列やフィルタを差し込ませない。
通常取得はページ単位、範囲取得は上限まで取得して追加読込を止める。先行要求をAbortControllerで中断し、古い結果による上書きを防ぐ。
取得失敗はホームの常設バナーと再試行へ返す。空の地図・0件の写真と通信エラーを区別する。
`Post` 型で受け渡していても一覧は表示用の一部列しか取らない。詳細・審査専用列がある前提で一覧を拡張しない。

## 地図と写真の表示

[MapViewWrapper](../../src/components/features/map/MapViewWrapper.tsx) がLeaflet本体をclientで遅延読込する。
ホームは先行タイル画像をSSRに置き、実地図を地域回答の取得後にマウントする。[初回案内](authentication-onboarding.md)
地図／写真の横ページャーは全画面幅で共通。地図の操作と衝突しないよう、端のスワイプまたは写真側だけで切り替える。
非表示のパネルは `inert` にして、画面外の操作子へTabが移動することを防ぐ。
[PhotoGallery](../../src/components/features/posts/PhotoGallery.tsx) は取得済み投稿の写真を並べ、詳細へつなぐ。写真の取得だけを別の公開経路にしない。
[PostList](../../src/components/features/posts/PostList.tsx) はカード・追加読込の監視・空状態を提供し、[PostCard](../../src/components/features/posts/PostCard.tsx) は要約・本人編集を受け持つ。

[MapView](../../src/components/features/map/MapView.tsx) は背景タイル、投稿クラスタ、調査依頼、現在地、個人用・調査用・水域レイヤーを組み合わせる。
公開投稿の `lat/lng` は `display_lat/display_lng` の別名。位置非公開のNULLを0に変換せず、有限で範囲内の座標だけをLeafletへ渡す。
表示範囲に余白を足してマーカーを間引き、位置配列を安定させる。Popupの画像・日付・経路は開いている間だけ組み立てる。
種は色だけでなく形とグリフで、不在確認は別の印で区別する。クラスタは自前SVGを使い、未読込の既定CSSに依存しない。
投稿マーカーはキーボード対象から外す既存仕様で、一覧を代替経路とする。個人スポットは件数が少ないためキーボードでたどれる。
現在地は [LocateControl](../../src/components/features/map/LocateControl.tsx) が持つ。状態の遷移は純関数の [locationFollow](../../src/lib/maps/locationFollow.ts)、位置の継続取得・地図の動かし方・画面ロックは [hooks](../../src/hooks/useFollowCamera.ts) に分けてある。位置の状態は `LocateControl` の中に閉じ、位置が届くたびに `MapView` が再描画されることはない（地図が動いたときは、既存の表示範囲の更新が走る）。追従中は、地図の範囲を検索に送る絞り込みを切る。[現在の仕様](../current/map.md)

ヒートマップは [heatWeight](../../src/lib/constants.ts) に個体数・調査時間を渡し、情報種別の重みに努力量の情報を反映する。
不在確認の熱源は0にする。不在の記録を消す処理ではなく、密度の熱源として足さないという意味。
背景とヒートマップ状態は [MapSettingsContext](../../src/context/MapSettingsContext.tsx)。背景の一時変更と保存済み既定値は別に保持する。
初期fitは最初の1回だけ。リサイズは地図サイズを無効化し、利用者の操作後に初期位置へ戻さない。
[MiniMap](../../src/components/features/map/MiniMap.tsx) と [MapModal](../../src/components/modals/MapModal.tsx) は詳細・審査などの小さな位置表示を担う。

## 個人用の地点と投稿開始

[PersonalMapLayer](../../src/components/features/map/PersonalMapLayer.tsx) はピンモード・長押し／右クリックの一時ピン、非公開スポット、クイック保存を持つ。
一時ピンは画面内だけで保持する。非公開スポットは `posts` と別の本人用データで、公開投稿の種・写真・審査を求めない。
[QuickSaveSheet](../../src/components/features/map/QuickSaveSheet.tsx) はピン位置またはGPSを使い、取得失敗時は再試行・地図中心の採用を明示的に選べる。
[usePrivateSpots](../../src/hooks/usePrivateSpots.ts) が読込・保存・改名・削除・利用者別の送信待ちを管理する。[オフライン](offline.md)
アカウント変更でレイヤーを作り直し、前利用者のデータ・途中応答を新利用者へ入れない。

「ここで投稿」は地点を [PostForm](../../src/components/features/posts/PostForm.tsx) の初期値にし、現在地で上書きしない。
フォームを開く前に [postLock](../../src/components/features/map/postLock.ts) が本人の近隣希少種を確認する。圏外・確認失敗も位置非公開へ倒す。
公開マップの粗化座標、本人の正確な地点、希少種の保護条件を混ぜない。[調査](fieldwork.md)・[投稿と審査](posting-moderation.md)
経路UIは [RouteLinks](../../src/components/ui/RouteLinks.tsx)。外部地図へ名前・メモを送らず、公開位置はおおよその位置と示す。
スワイプのtransformの内側で固定配置が崩れないよう、個人用フォームはbodyへportalする。

## レイヤーを足す場所と確認

[MapActionStack](../../src/components/features/map/MapActionStack.tsx) は操作ボタンの入れ物と順番を共有する。各レイヤーが互いの高さを計算しないため。
[MapTopSlot](../../src/components/features/map/MapTopSlot.tsx) は注意帯の高さを確保し、地図と切替ボタンの位置へ伝える。マーカーを帯で隠さない。
調査は [FieldworkLayer](../../src/features/fieldwork/components/FieldworkLayer.tsx)、水域は [NearbyWaterLayer](../../src/features/water/components/NearbyWaterLayer.tsx) が差し込み口。
計算・候補取得は [水域処理](water-geometry.md)、投稿フォームは [位置・写真・音声](map-posts-media.md)、閲覧後の操作は [詳細](map-posts-detail.md)。
[地図テスト](../../src/components/features/map/__tests__/)、[取得hookテスト](../../src/hooks/posts/__tests__/usePostList.test.ts)、[個人スポットテスト](../../src/hooks/__tests__/usePrivateSpots.test.ts) を参照する。
取得条件・公開列はhook／data層、地図の描画はMapView、個人操作はPersonalMapLayerを入口に変更する。
