## 現状分析

### 既に実装されているもの（予想以上に良い水準）

| 項目 | 状況 | 実装箇所 |
|------|------|---------|
| 動的 title / description | ✅ 全主要ページ対応 | `PageSEO.jsx` |
| OGP（og:title, og:image 等） | ✅ 実装済み | `PageSEO.jsx` / `index.html` |
| Twitter Card | ✅ summary_large_image | `index.html` |
| Canonical URL | ✅ ページ別設定 | `PageSEO.jsx` |
| robots.txt | ✅ 管理画面・ダッシュボード除外 | `public/robots.txt` |
| sitemap.xml | ✅ 静的3ページ | `public/sitemap.xml` |
| JSON-LD 構造化データ | ✅ FAQPage・Report・WebSite | `AboutPage.jsx` / `DetailPage.jsx` |
| 投稿詳細の動的SEO | ✅ 種類・市区町村・コメントから生成 | `DetailPage.jsx` |

### 課題（本当に対処が必要なもの）

| 課題 | 深刻度 | 説明 |
|------|--------|------|
| **SPA クローラー問題** | 🔴 重大 | React SPA のためクローラーが JavaScript を実行しないと内容を読めない。投稿詳細ページが事実上インデックスされていない可能性 |
| **動的投稿が sitemap 未掲載** | 🔴 重大 | `/post/:id` が sitemap.xml に含まれない。Googleが投稿を発見しにくい |
| **ドメイン不一致** | 🟠 重要 | `index.html` の canonical が `zaridasu.com` だが実際は `zaridasu.vercel.app`。canonical エラーが発生している可能性 |
| **TrendsPage の二重制御** | 🟡 軽微 | `noIndex={true}` かつ `robots.txt` でブロック。どちらか一方で十分 |
| **og:image の最適化** | 🟡 軽微 | デフォルト OG 画像（SVG/PNG）の品質と最適化 |
| **hreflang なし** | 🟡 軽微 | 多言語（ja/en/zh/ko）対応しているが hreflang タグなし |
| **Core Web Vitals** | 🟡 軽微 | Leaflet.js 等の大きなバンドルによる LCP 遅延の可能性 |

---

