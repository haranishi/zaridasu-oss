### 問題A: indexable な静的ページ7本が og:url / og:title を親から継承し、og:url が全て「サイトルート」になる — High

`openGraph` を定義していない indexable ページは次の**7本**。

| ページ | metadata 定義箇所 | 自前の title |
|---|---|---|
| `/trends` | `src/app/trends/page.tsx:5-9` | トレンド・統計 |
| `/ranking` | `src/app/ranking/page.tsx:6-10` | みんなの記録 |
| `/area` | `src/app/area/page.tsx:9-13` | 地域別外来生物情報 |
| `/about` | `src/app/about/page.tsx:9-12` | 使い方・種類図鑑・外来種法 |
| `/terms` | `src/app/terms/page.tsx:6-10` | 利用規約 |
| `/privacy` | `src/app/privacy/page.tsx:6-10` | プライバシーポリシー |
| `/dataset` | `src/app/dataset/page.tsx:30-35` | オープンデータ（外来生物 観察データの公開・DOI 引用） |

継承元は `src/app/layout.tsx:22-31` の

```
openGraph: {
  type: 'website', locale: 'ja_JP', siteName: 'ザリダス',
  title: 'ザリダス - 秋田県外来生物情報マップ',
  description: '秋田県外来生物出没・分布情報マップ。…',
  url: '/',
  images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'ザリダス - 秋田県外来生物情報マップ' }],
}
```

で、`url: '/'` が固定されている。**Next.js の metadata はページの `title` から openGraph を自動補完しない**ため、上記7本は自前の `title` を持っているにもかかわらず og:title がホームのものになる。ビルド成果物での実測（7本すべて同一）:

```
<meta property="og:title" content="ザリダス - 秋田県外来生物情報マップ"/>
<meta property="og:description" content="秋田県外来生物出没・分布情報マップ。…"/>
<meta property="og:url" content="（サイトルート）"/>
```

**同じ欠陥をプロジェクト自身が既に認識している。** `src/app/requests/page.tsx:8-12` には

```
// REQ-275 FR-275-02: index 対象・sitemap 掲載ページなのに自己参照 canonical が無く、
// 絞り込みクエリ付きURL（?species= 等）が重複インデックスされ得た。og:url も親の '/' を
// 継承していたため明示する。
alternates: { canonical: '/requests' },
openGraph: { url: '/requests' },
```

とコメント付きで修正済みだが、**他の7ページに展開されていない**。

影響は2つある。(1) X / Facebook / LINE / Slack で `/trends` `/ranking` `/dataset` 等を共有すると、カードのタイトル・説明・**リンク先**が全てホームのものになる（`/dataset` は研究・行政向けのオープンデータ配布ページで、学術的な共有経路が想定されるにもかかわらずホームのカードが出る）。(2) og:url を正規URLとして採用するクローラでは、7本すべてがホームの重複として扱われるリスクがある。
