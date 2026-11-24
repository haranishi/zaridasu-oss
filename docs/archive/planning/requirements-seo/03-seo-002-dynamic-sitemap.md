## SEO-002: 動的サイトマップ（Supabase連携）

### 背景

現在の `sitemap.xml` には3ページのみ（/、/about、/trends）。投稿詳細ページ（/post/:id）が含まれないため、Googleが個別投稿ページを発見しにくい。

### ユーザーストーリー

```
As a Googlebot,
I want to ザリガニダスの全投稿ページのURLリストを取得したい,
So that 秋田県内の出没情報を網羅的にインデックスできる。

受け入れ条件:
- [ ] /sitemap.xml にアクセスすると最新の投稿IDが含まれる
- [ ] 直近90日の投稿を対象とする（古い投稿は低頻度アクセスで十分）
- [ ] 各URLに lastmod（最終更新日）が含まれる
- [ ] サイトマップの件数上限は50,000件（Googleの仕様）
- [ ] Vercel の `rewrites` で /sitemap.xml → /api/sitemap にルーティングされる
```

### 実装設計

```javascript
// api/sitemap.js（Vercel Serverless Function）
import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY  // サービスロールキー（読み取り専用）
  )

  // 直近90日の投稿を取得（SEO価値の高いもの）
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
  const { data: posts } = await supabase
    .from('posts')
    .select('id, updated_at')
    .gte('created_at', ninetyDaysAgo)
    .order('created_at', { ascending: false })
    .limit(5000)

  const staticPages = [
    { loc: 'https://zaridasu.com/', changefreq: 'hourly', priority: '1.0' },
    { loc: 'https://zaridasu.com/about', changefreq: 'monthly', priority: '0.8' },
  ]

  const dynamicPages = (posts ?? []).map((post) => ({
    loc: `https://zaridasu.com/post/${post.id}`,
    lastmod: post.updated_at.split('T')[0],
    changefreq: 'weekly',
    priority: '0.6',
  }))

  const xml = buildSitemapXml([...staticPages, ...dynamicPages])

  res.setHeader('Content-Type', 'application/xml')
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate')
  res.send(xml)
}
```

### vercel.json への追記

```json
{
  "rewrites": [
    { "source": "/sitemap.xml", "destination": "/api/sitemap" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

---

