### 問題C: twitter カードが8ページで親継承（twitter:title が全てホームのタイトル）— Medium

`src/app/layout.tsx:32-37` に

```
twitter: { card: 'summary_large_image', title: 'ザリダス - 秋田県外来生物情報マップ', description: '…', images: ['/og-image.png'] }
```

が明示定義されている。Next.js は `twitter` が未定義のページでこれをそのまま継承し、**og:* からのフォールバックは行わない**。`twitter` を定義しているのは `layout.tsx` / `lp` / `post/[id]` / `area/[municipality]` / `area/[municipality]/[species]` / `species/[species]` / `profile/[userId]` / `request/[id]` の8ファイルで、**問題Aの7ページ＋`/requests`（openGraph は明示したが twitter は未定義）の計8ページが親継承**である。

ビルド成果物での実測（8ページすべて同一）:

```
<meta name="twitter:title" content="ザリダス - 秋田県外来生物情報マップ"/>
<meta name="twitter:description" content="秋田県外来生物出没・分布情報マップ。…"/>
```

`/requests` は og:title が「調査依頼一覧 | ザリダス」なのに twitter:title が「ザリダス - 秋田県外来生物情報マップ」という**同一ページ内で不一致**になっている。影響は X 上の CTR と、ページ単位の流入計測（どのページが共有されたのか判別できない）。

対応には2つの方向がある。**どちらを採るかは判断が必要**（→ FR-312-04）。

| 案 | 内容 | 長所 | 短所 |
|---|---|---|---|
| C-1 | root の `twitter` から `title` / `description` を外し、og からのフォールバックに任せる | 1箇所の修正で8ページが直る。以後追加するページも自動で正しくなる | `card` / `images` の指定は残す必要があり、og:image を持たないページ（現状の `/requests`）で画像が消える。問題Bの修正が前提 |
| C-2 | 各ページで `twitter` を明示 | 個別に最適な文言を出せる | 8ページ＋今後の全ページで二重記述。退行しやすい（問題A/Bと同じ構造の再生産） |
