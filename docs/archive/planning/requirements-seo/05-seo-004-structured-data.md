## SEO-004: 構造化データの強化

### 背景

現状の構造化データ:
- `WebSite` スキーマ（index.html）
- `WebApplication` スキーマ（index.html）
- `FAQPage` スキーマ（AboutPage）
- `Report` スキーマ（DetailPage）

追加で効果的なスキーマ:

### 追加するスキーマ

#### ① Organization スキーマ（index.html へ追加）

```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "ザリガニダス",
  "url": "https://zaridasu.com",
  "logo": "https://zaridasu.com/icon-512.svg",
  "description": "秋田県外来生物出没・分布情報マップ",
  "areaServed": {
    "@type": "AdministrativeArea",
    "name": "秋田県",
    "addressCountry": "JP"
  },
  "sameAs": []
}
```

#### ② BreadcrumbList スキーマ（DetailPage へ追加）

投稿詳細ページに「ホーム > 秋田市 > アメリカザリガニ目撃情報」のパンくずを追加。
検索結果に階層表示され、CTRが向上する。

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "name": "ホーム",
      "item": "https://zaridasu.com/"
    },
    {
      "@type": "ListItem",
      "position": 2,
      "name": "秋田市の情報",
      "item": "https://zaridasu.com/?municipality=秋田市"
    },
    {
      "@type": "ListItem",
      "position": 3,
      "name": "アメリカザリガニの目撃情報"
    }
  ]
}
```

#### ③ Dataset スキーマ（TrendsPage / ホームページへ追加）

統計データページに Dataset スキーマを追加。Google のデータセット検索に表示される可能性がある。

```json
{
  "@context": "https://schema.org",
  "@type": "Dataset",
  "name": "秋田県外来生物出没データ",
  "description": "秋田県内のアメリカザリガニ・ウシガエル出没情報の集計データ",
  "license": "https://creativecommons.org/licenses/by/4.0/",
  "creator": { "@type": "Organization", "name": "ザリガニダス" },
  "spatialCoverage": { "@type": "Place", "name": "秋田県" },
  "temporalCoverage": "2024/.."
}
```

---

