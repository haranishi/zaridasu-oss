# 投稿詳細・編集・交流

基点：`6070714870e5`。公開と審査の正本は [posts](../current/posts.md)・[moderation](../current/moderation.md)。

## サーバー初期値からclient操作へ

[post/[id]/page](../../src/app/post/[id]/page.tsx) は閲覧できる投稿、コメント、いいねをまとめて取得する。
React `cache()` でmetadataと本文の取得を同じリクエスト内で共有し、[DetailPageClient](../../src/app/post/[id]/DetailPageClient.tsx) へ初期値を渡す。
このcacheは利用者をまたぐ永続キャッシュではない。権限に従って読めない／存在しない投稿は404へ進む。
[DetailPage](../../src/views/DetailPage.tsx) はIDが合う初期値があれば取り直さず、無い場合にclientの詳細取得へ戻る。
取得失敗・取得中・該当なしを分ける。クライアントの失敗を「存在しない」と表示して終えない。

初期コメントは [CommentSection](../../src/components/features/posts/CommentSection.tsx)、初期いいねは [useLike](../../src/hooks/useLike.ts) へ渡し、同じ情報を重複取得しない。
サーバー用列は地理情報をSEOへ渡すため、client用の詳細列と意図的に異なる。[SEO](localization-ui-seo.md)
一般閲覧の座標は粗化またはNULLのまま。所有者だけ `get_my_post_location` RPCで正確座標を補い、失敗時は公開用表示を保つ。
正確な位置を、共有metadataや一般公開データへ混ぜない。[認可](authorization.md)

## 詳細で読める意味

種・情報種別・観察日・個体数・天候・地名・写真・音声・調査努力量を、取得できる項目に応じて見せる。
位置非公開なら公開マーカーを出さない。本人の「位置を非公開にする」は専用書き込み経路で処理する。
写真の拡大・前後移動・スワイプは [PhotoViewer](../../src/components/ui/PhotoViewer.tsx)、音声再生は [AudioPlayer](../../src/components/ui/AudioPlayer.tsx) が担う。
画像は [imageUtils](../../src/lib/imageUtils.ts) のサムネイルURLも使い、一覧の小画像と原画像の用途を分ける。
AIの同定・助言は投稿に付いた結果として表示する。[aiAdvice](../../src/lib/aiAdvice.ts) が状態に応じた案内を作る。
AI結果の描画を人の承認・生息の確証と同一視しない。解析と審査の経路は [通知とAI](notifications-ai.md) に続く。

## 本人の編集と削除

[EditDialog](../../src/components/modals/EditDialog.tsx) は編集可能な項目と写真の差分を集める。
[useEditPost](../../src/hooks/posts/useEditPost.ts) が入力を検証し、削除写真のStorage処理、新規写真の保存、本人のUPDATEを実行する。
種または写真が変わり写真が残る場合、AI結果を判定中へ戻して再解析を依頼する。解析起動の失敗は記録し、保存済み編集は戻さない。
[storage](../../src/lib/storage.ts) は写真の変換・本人prefixへの保存・URLからのpath抽出・削除を共有する。
編集は詳細とPostCardで同じhookを使い、成功後に呼び出し側が表示値を更新する。

[DeleteDialog](../../src/components/modals/DeleteDialog.tsx) とカード内確認は対象を示し、[useDeletePost](../../src/hooks/posts/useDeletePost.ts) へ渡す。
本人削除hookは写真削除が失敗したら投稿削除を止める。DB行が消えただけで素材の実体も消えたとは扱わない。
編集・削除の写真処理とDB更新は一括transactionではない。片側失敗を検証するときはStorageと行の両方を確認する。
`is_anonymous` は表示上の匿名で、ログイン不要の意味ではない。編集で本人性や匿名状態のDB契約を迂回しない。

## いいね・コメント・通報

useLikeは押下前の値を控え、先に件数と状態を変える。失敗時は戻してサーバー値と再同期し、呼び出し側へ失敗を返す。
refの排他で重複要求を防ぎ、未ログインはAuthModal、メール未確認は専用案内へ回す。
いいねの演出は表示上の反応で、XP付与には使わない。[参加設計](participation.md)

CommentSectionは入力schemaを通し、一時IDの行を楽観追加する。成功で確定IDへ差し替え、失敗で行を除き本文を戻す。
通知は確定コメントIDだけを `notify-comment` に渡す。自由記述を通知関数の呼び出しpayloadへ複写しない。
コメント削除も先に隠して、失敗したら一覧を戻す。本人／管理者の表示判定とDBの権限は別に確認する。
取得エラーと書き込みエラーは別stateにし、コメント0件と通信失敗を区別する。

[ReportModal](../../src/components/modals/ReportModal.tsx) が理由・補足を検証し、通報を作る。受付後の運営判断は [管理画面](frontend-admin.md) が担当する。
写真・コメント・通報の表示に個人情報や正確座標を追加する場合は [privacy](../current/privacy.md) を先に読む。

## 共有・変更・確認

[LikeShareSection](../../src/components/features/posts/LikeShareSection.tsx) がX・LINE・対応端末の共有シート・リンクコピーを提供する。
共有URLと操作計測は [shareUtm](../../src/lib/shareUtm.ts)・[lpAnalytics](../../src/lib/lpAnalytics.ts)。端末共有のキャンセルは成功として数えない。
共有の機能可否はnavigatorで判定し、ブラウザAPIが失敗しても閲覧を止めない。[公開ページとSEO](localization-ui-seo.md)

[サーバー詳細テスト](../../src/app/post/[id]/__tests__/page.test.tsx)、[いいねテスト](../../src/hooks/__tests__/useLike.test.ts)、[編集](../../src/hooks/posts/__tests__/useEditPost.test.ts)・[削除](../../src/hooks/posts/__tests__/useDeletePost.test.ts) が処理境界の入口。
共通モーダルは [a11yテスト](../../src/components/modals/__tests__/REQ302.a11y.test.tsx)、要約表示は [PostCardテスト](../../src/components/features/posts/__tests__/PostCard.test.tsx) を参照する。
詳細の項目・ローカル状態はDetailPage、交流は専用component／hook、公開列と本人更新はdata層、メタデータはserver pageが変更箇所。
