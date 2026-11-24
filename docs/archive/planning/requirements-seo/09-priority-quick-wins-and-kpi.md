## 実装優先度マトリクス

| 優先度 | ID | 施策 | 影響度 | コスト | 推奨時期 |
|--------|-----|------|--------|--------|---------|
| 🔴 | SEO-001 | SPA プリレンダリング（Edge Function） | 大 | 大 | 2週間以内 |
| 🔴 | SEO-002 | 動的サイトマップ（Supabase連携） | 大 | 中 | 1週間以内 |
| 🟠 | SEO-003 | ドメイン・Canonical 統一 | 中 | 小 | 即時 |
| 🟠 | SEO-006-fix | description の不整合修正（ウチダザリガニ等） | 中 | 小 | 即時 |
| 🟡 | SEO-007-robots | robots.txt の二重制御解消 | 小 | 小 | 即時 |
| 🟡 | SEO-004 | BreadcrumbList 構造化データ追加 | 中 | 小 | 1週間以内 |
| 🟡 | SEO-005-p1 | 種類別デフォルト OGP 画像 | 中 | 小 | 1週間以内 |
| 🟡 | SEO-007-hreflang | hreflang タグ追加 | 小 | 小 | 1週間以内 |
| 🔵 | SEO-005-p2 | 動的 OGP 画像生成（@vercel/og） | 中 | 大 | 将来 |
| 🔵 | SEO-004-dataset | Dataset スキーマ | 小 | 小 | 将来 |

---

## 即時対応可能な施策（コスト小・即効性あり）

以下の3点はコードを数行変更するだけで対応可能。

### 1. description の不整合修正（SEO-006-fix）

`HomePage.jsx` の description から「ウチダザリガニ・ニホンザリガニ」を削除。

```jsx
// 変更前
description="...アメリカザリガニ・ウチダザリガニ・ニホンザリガニの目撃・捕獲..."

// 変更後
description="秋田県のアメリカザリガニ・ウシガエル出没情報マップ。目撃・捕獲・農業被害をリアルタイムで地図上に記録・共有できます。匿名投稿可能。秋田県全25市町村対応。"
```

### 2. robots.txt の二重制御解消（SEO-007-robots）

```
# 変更前
Disallow: /trends

# 変更後
# /trends は TrendsPage.jsx の noIndex で制御するため削除
```

### 3. BreadcrumbList の追加（SEO-004）

`DetailPage.jsx` の既存 JSON-LD に BreadcrumbList を追加（4〜5行）。

---

## 測定・効果検証

### 導入すべき計測ツール

| ツール | 目的 | 設定場所 |
|--------|------|---------|
| Google Search Console | インデックス状況・検索クエリ確認 | Vercel カスタムドメイン設定後 |
| Google Analytics 4 | トラフィック・流入経路分析 | `index.html` または GTM |
| PageSpeed Insights | Core Web Vitals 計測 | 手動測定 |

### KPI

| 指標 | 現状（推定） | 目標（3ヶ月後） |
|------|------------|--------------|
| Googleインデックス済みページ数 | 3〜5ページ | 50ページ以上 |
| オーガニック流入（月間） | ほぼゼロ | 200セッション |
| 投稿詳細ページの Search impressions | 0 | 500/月 |
| LCP（投稿詳細ページ） | 未測定 | 2.5秒以内 |
