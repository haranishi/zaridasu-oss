# 全画面の一覧：URLと開き方

[画面ガイドへ戻る](README.md)。実装にある **37種類のページ** を対応付けています。
`[id]`・`[userId]`・`[municipality]`・`[species]` は対象によって変わる値です。地域・種は一覧等のリンクから選びます。

## URLを持つページ

| URL | 役割 | 使い方・実装 |
|---|---|---|
| `/` | 起動時ホーム | [使い方](home.md)・[ソース](<../../src/app/(home)/page.tsx>) |
| `/map` | 地図・写真 | [使い方](map.md)・[ソース](<../../src/app/map/page.tsx>) |
| `/guide` | 記録ガイド（記録方法・まだ足りない記録・FAQ） | [使い方](home.md)・[ソース](<../../src/app/guide/page.tsx>) |
| `/about` | 目的と使い方の説明 | [使い方](information.md)・[ソース](<../../src/app/about/page.tsx>) |
| `/area` | 地域の一覧 | [使い方](explore-and-data.md)・[ソース](<../../src/app/area/page.tsx>) |
| `/area/[municipality]` | 市町村の情報 | [使い方](explore-and-data.md)・[ソース](<../../src/app/area/[municipality]/page.tsx>) |
| `/area/[municipality]/[species]` | 地域と種で絞った入口 | [使い方](explore-and-data.md)・[ソース](<../../src/app/area/[municipality]/[species]/page.tsx>) |
| `/auth/callback` | 認証メール・認証からの復帰 | [使い方](account.md)・[ソース](<../../src/app/auth/callback/page.tsx>) |
| `/collection` | 本人の図鑑・水槽 | [使い方](personal.md)・[ソース](<../../src/app/collection/page.tsx>) |
| `/dashboard` | 本人の投稿・進行・送信待ち | [使い方](personal.md)・[ソース](<../../src/app/dashboard/page.tsx>) |
| `/dataset` | 公開データの範囲と入手 | [使い方](explore-and-data.md)・[ソース](<../../src/app/dataset/page.tsx>) |
| `/lp` | 初めての人への紹介 | [使い方](information.md)・[ソース](<../../src/app/lp/page.tsx>) |
| `/offline` | 通信できないときの案内 | [使い方](information.md)・[ソース](<../../src/app/offline/page.tsx>) |
| `/post/[id]` | 一つの観察の詳細 | [使い方](posting.md)・[ソース](<../../src/app/post/[id]/page.tsx>) |
| `/privacy` | 個人情報・公開範囲の説明 | [使い方](information.md)・[ソース](<../../src/app/privacy/page.tsx>) |
| `/profile` | 本人の管理への入口 | [使い方](personal.md)・[ソース](<../../src/app/profile/page.tsx>) |
| `/profile/[userId]` | 公開プロフィール | [使い方](personal.md)・[ソース](<../../src/app/profile/[userId]/page.tsx>) |
| `/ranking` | 多様性・品質・件数の比較 | [使い方](explore-and-data.md)・[ソース](<../../src/app/ranking/page.tsx>) |
| `/request/[id]` | 一つの調査依頼と協力 | [使い方](collaboration.md)・[ソース](<../../src/app/request/[id]/page.tsx>) |
| `/requests` | 調査依頼の一覧 | [使い方](collaboration.md)・[ソース](<../../src/app/requests/page.tsx>) |
| `/species/[species]` | 対象の生きものの説明 | [使い方](information.md)・[ソース](<../../src/app/species/[species]/page.tsx>) |
| `/terms` | 利用規約 | [使い方](information.md)・[ソース](<../../src/app/terms/page.tsx>) |
| `/trends` | 推移・内訳の集計 | [使い方](explore-and-data.md)・[ソース](<../../src/app/trends/page.tsx>) |
| `/u/unsubscribe` | メールリンクから配信停止 | [使い方](information.md)・[ソース](<../../src/app/u/unsubscribe/page.tsx>) |
| `/admin` | 概況 | [使い方](admin.md)・[ソース](<../../src/app/admin/(protected)/page.tsx>) |
| `/admin/ai-cost` | AI利用・費用 | [使い方](admin.md)・[ソース](<../../src/app/admin/(protected)/ai-cost/page.tsx>) |
| `/admin/comments` | コメント管理 | [使い方](admin.md)・[ソース](<../../src/app/admin/(protected)/comments/page.tsx>) |
| `/admin/experiments` | 実験の指標 | [使い方](admin.md)・[ソース](<../../src/app/admin/(protected)/experiments/page.tsx>) |
| `/admin/kpi` | 研究KPI | [使い方](admin.md)・[ソース](<../../src/app/admin/(protected)/kpi/page.tsx>) |
| `/admin/login` | 管理者ログイン | [使い方](admin.md)・[ソース](<../../src/app/admin/login/page.tsx>) |
| `/admin/logs` | 監査ログ | [使い方](admin.md)・[ソース](<../../src/app/admin/(protected)/logs/page.tsx>) |
| `/admin/posts` | 投稿審査 | [使い方](admin.md)・[ソース](<../../src/app/admin/(protected)/posts/page.tsx>) |
| `/admin/rare-sightings` | 希少種管理 | [使い方](admin.md)・[ソース](<../../src/app/admin/(protected)/rare-sightings/page.tsx>) |
| `/admin/reports` | 通報管理 | [使い方](admin.md)・[ソース](<../../src/app/admin/(protected)/reports/page.tsx>) |
| `/admin/spots` | 非公開スポットの閲覧 | [使い方](admin.md)・[ソース](<../../src/app/admin/(protected)/spots/page.tsx>) |
| `/admin/users` | 利用者・管理権限 | [使い方](admin.md)・[ソース](<../../src/app/admin/(protected)/users/page.tsx>) |
| `/admin/water-reports` | 水域の情報提供の審査 | [使い方](admin.md)・[ソース](<../../src/app/admin/(protected)/water-reports/page.tsx>) |

## 画面の中で開くもの

| フォーム・パネル | 主な開き方 | 案内 |
|---|---|---|
| 登録・ログイン・パスワード手続き | 投稿・マイページ等から認証を要求したとき | [認証](account.md) |
| 4画面の初回案内 | 未完了の会員、ホームの誘い、メニューから再表示 | [初回案内](account.md) |
| 投稿フォーム | 投稿操作、地図の地点、調査結果を投稿する操作 | [投稿](posting.md) |
| 写真拡大・編集・削除・通報 | 投稿詳細や、許可された投稿の操作 | [詳細](posting.md) |
| プロフィール編集・通知 | マイページの編集 | [本人の活動](personal.md) |
| 調査依頼の作成 | 一覧の作成、`/requests?create=1` | [依頼](collaboration.md) |
| 地図設定・言語・テーマ・紹介 | ヘッダーのメニュー | [設定](account.md) |
| 地点のクイック保存 | 地図の一時ピン・地点の操作 | [本人用の場所](fieldwork.md) |
| 計画・地点・不在・希少種 | 地図の調査操作、計画内の地点 | [現地調査](fieldwork.md) |
| 水域の候補・情報提供 | 地図からの周辺検索、候補一覧 | [水域](water.md) |
| 却下理由・削除確認・一括操作 | 管理画面で対象を選んだとき | [管理](admin.md) |

404・ページ表示エラー・読み込み・送信待ち等は状態に応じた表示で、個別の公開URLが増えるわけではありません。
ログインの要否・公開範囲・開けないときの条件は各ガイドと [現行仕様](../current/README.md) を参照してください。

## 更新するとき

新しい `src/app/**/page.tsx` と、URLを持たない主要画面をここへ加え、対応するガイドへリンクします。
ルートグループ `(home)`・`(protected)` はURLに含めません。API・CSV・GeoJSON・OG画像の入口はページと分けます。
調査基点：`c9a4c3608d43`。コードの配置は [構造規約](../project-structure-conventions.md)、処理は [設計ガイド](../architecture/README.md) へ。
