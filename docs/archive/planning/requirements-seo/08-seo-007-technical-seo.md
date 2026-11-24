## SEO-007: 技術的SEO の整備

### robots.txt の整理

```
現状（問題あり）:
Disallow: /trends   ← robots.txt でブロック + noIndex の二重制御

改善:
- /trends の noIndex フラグを削除（PageSEO.jsx）
- robots.txt の Disallow: /trends を削除
- robots.txt の管理はシンプルにする
  （or /trends をインデックスさせる方針に変更）
```

#### 改善後 robots.txt

```
User-agent: *
Allow: /
Disallow: /admin/
Disallow: /dashboard
Disallow: /offline

Sitemap: https://zaridasu.com/sitemap.xml
```

### hreflang タグの追加（多言語対応）

アプリが ja/en/zh/ko の4言語に対応しているため、hreflang タグを追加する。

```html
<!-- PageSEO.jsx に追加 -->
<link rel="alternate" hreflang="ja" href="https://zaridasu.com/" />
<link rel="alternate" hreflang="en" href="https://zaridasu.com/?lang=en" />
<link rel="alternate" hreflang="zh" href="https://zaridasu.com/?lang=zh" />
<link rel="alternate" hreflang="ko" href="https://zaridasu.com/?lang=ko" />
<link rel="alternate" hreflang="x-default" href="https://zaridasu.com/" />
```

### Core Web Vitals 対策

```
LCP（Largest Contentful Paint）改善:
  - Leaflet.js の遅延ロード（dynamic import）
  - OGP 画像の WebP 化・サイズ最適化
  - フォントの preload

CLS（Cumulative Layout Shift）改善:
  - 地図コンテナの高さを CSS で事前確保（現状は h-48 で対応済み）
  - 画像の width/height 属性指定

FID/INP（Interaction to Next Paint）改善:
  - マップ操作の debounce（REQ-009 で対応済み）
```

---

