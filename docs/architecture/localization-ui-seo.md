# 公開ページ・共有・検索と計測

基点：`6070714870e5`。公開データの契約は [public-dataset](../current/public-dataset.md)、紹介導線は [introduction](../current/introduction.md)。

## 入口ごとに説明を変える

| 実装 | 利用者の目的とデータ |
| --- | --- |
| [LandingPage](../../src/views/LandingPage.tsx) | 初めて来た人へ価値・使い方・FAQを伝え、登録または地図へ進める |
| [AboutPage](../../src/views/AboutPage.tsx) | サービス概要、対象生物、使い方、FAQを必要時に参照する |
| [種のserver page](../../src/app/species/[species]/page.tsx) | 種の説明と公開報告の要約から、地域・記録・アプリへ進める |
| [AreaListPage](../../src/views/AreaListPage.tsx) | 市町村の一覧から地域へ進む |
| [地域server page](../../src/app/area/[municipality]/page.tsx) と [AreaPage](../../src/views/AreaPage.tsx) | 公開記録を地域単位にまとめ、種の切替と隣接地域へつなぐ |
| [地域×種server page](../../src/app/area/[municipality]/[species]/page.tsx) | 対象を絞った報告と構造化データを出す。薄い内容の検索露出を制御する |
| [dataset page](../../src/app/dataset/page.tsx) | 配布内容・列・ライセンス・利用方法とCSV／GeoJSONへの入口を示す |
| [TermsPage](../../src/views/TermsPage.tsx)・[PrivacyPage](../../src/views/PrivacyPage.tsx) | 規約、公開データ再配布の扱い、個人情報の説明を静的本文で提示する |

LP・地域・種・配布ページはcookieに依存しないanon clientで公開データを読み、日次再生成を設定する。
これは認証済み利用者の非公開データをキャッシュする経路ではない。[認可](authorization.md)
LPの実績数値は公開投稿・公開プロフィールの件数。取得失敗や報告0件では数値カードを出さず、ページ自体は表示する。
地域viewの一覧と種別件数は渡された投稿配列から作る一方、serverの総件数・期間は別クエリで求める箇所がある。上限付き一覧を全件統計と扱わない。

## URLと検索向けmetadata

[root layout](../../src/app/layout.tsx) が既定タイトル・OGP・Twitterカード・サイト構造化データを出す。
[seo](../../src/lib/seo.ts) の `buildPageMetadata` はcanonicalとOG URLを同じpathから作り、画像・サイト名など必要な値を埋める。
Next.jsのmetadataはOG／Twitterを深くマージしないため、ページの部分指定だけで親の必要項目が消える事故を避ける設計。
既にブランドを含むタイトルはabsoluteにして、末尾ブランドの二重付与を避ける。既存の専用metadata実装も各server pageに残る。

投稿詳細は `generatePostSEO`、地域はDataset、種はWebPage／種エンティティ、紹介はFAQなど、ページの実内容に対応させる。
学名・外部識別URIは [種マスタ](../../src/lib/constants.ts) から共有する。構造化データだけに別の種名を手書きしない。
`safeJsonLd` は `<` をエスケープし、利用者の文字列をscript終了に使わせない。
位置非公開のNULLはGeoCoordinatesを出さない。`Number(null)` による0,0の架空座標を作らない。
[useDetailSEO](../../src/hooks/useDetailSEO.ts) はclientでの詳細表示に合わせる補助経路で、serverの共有カードと両方を照合する。
投稿の正確座標と本人専用表示を公開metadataへ混ぜない。[投稿詳細](map-posts-detail.md)

[sitemap](../../src/app/sitemap.ts) は静的入口と公開投稿・依頼・内容がある地域×種を掲載する。
地域×種の報告数がしきい値未満ならnoindexと親canonicalへ寄せ、sitemapからも外す。しきい値の出どころはconstants。
公開プロフィールはnoindexなのでsitemapへ載せない。管理領域は [admin/layout](../../src/app/admin/layout.tsx) が配下まとめてnoindexにする。
[robots](../../src/app/robots.ts) のdisallowはクロールの指示で、認証・認可やnoindexの代わりではない。
存在しない投稿・依頼はclientの「見つからない」表示だけで終えずserverで404へ進む。[画面構成](frontend.md)

## アプリからの共有と外部施策

[LikeShareSection](../../src/components/features/posts/LikeShareSection.tsx) はX・LINE・対応端末の共有シート・リンクコピーを持つ。
[shareUtm](../../src/lib/shareUtm.ts) はoriginと対象pathから共有URLを作り、経路別のUTMを付ける。InstagramやYouTubeへの直接投稿機能ではない。
外部の地図で経路を開く操作は [routeLinks](../../src/lib/maps/routeLinks.ts) の別責任。位置だけを渡し、地点名・メモをURLへ載せない。
外部施策のURLは `buildCampaignUrl`、流入元の値とTTLは [acquisition](../../src/lib/acquisition.ts) が管理する。
LPのCTAは `/?auth=signup&from=lp` などで共通認証を開き、ホームでクエリを除く。[認証](authentication.md)
配布済みURLの帰属情報は後から補えないため、施策開始前に台帳とcontent識別を決める判断がコードに記録されている。

## 行動計測は本体から切り離す

[analytics](../../src/lib/analytics.ts) はproductionのbrowserでGTM/dataLayerへ送り、失敗しても本来の投稿・検索・操作を止めない。
`page_view` はGA4の履歴イベントに任せ、同じ画面遷移をアプリから重ねて送らない。
[lpAnalytics](../../src/lib/lpAnalytics.ts) はLPイベントを同じ送出口へ渡す。共有の `trackShare` は同じdataLayerへ直接送る別関数。
ホームは検索語の本文ではなく文字数、地図は生のboundsや座標ではなく操作種別、投稿は種・媒体有無などを送る。
ただしイベントAPIは任意のparamsを受けるため、PIIを自動で全面除去する仕組みとみなさない。追加する呼び出し元の値を確認する。
[WebVitalsReporter](../../src/components/ui/WebVitalsReporter.tsx) はLCP等を報告する。計測設定と性能予算は [運用](operations-ci.md)。

## LPの表示と変更・確認

LPのスクロール演出はJS起動後のclassでだけ有効にし、JS不調時に本文・CTAを永続非表示にしない。
reduced-motionまたはIntersectionObserver非対応では最終表示を出し、画面外の無限演出は止める。
ヒーロー素材は [public/lp](../../public/lp/)、LP専用カードは [og-image-lp.png](../../public/og-image-lp.png)。[共通素材](localization-ui.md)

metadata・公開取得・404はserver page、説明とCTAはview、URL・JSON-LD・計測の共通規則はlibが変更箇所。
[metadata契約](../../src/app/__tests__/page-metadata.contract.test.ts)、[seoテスト](../../src/lib/__tests__/seo.test.ts)、[LPテスト](../../src/views/__tests__/LandingPage.test.tsx)、[地域SSRテスト](../../src/app/area/[municipality]/__tests__/page.test.tsx) を参照する。
配布列やライセンスを変える場合はUIだけを変えず、[公開データの正本](../current/public-dataset.md) と配布routeの検証へ進む。
