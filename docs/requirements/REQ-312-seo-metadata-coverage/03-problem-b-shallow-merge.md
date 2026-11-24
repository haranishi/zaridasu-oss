### 問題B: 部分的な `openGraph` 定義が親の og:image / og:site_name / og:type / og:locale を消しており、`/requests` に OG画像が無い — High

問題Aの「対比として正しい」とされている `/requests` の修正が、**shallow merge により別の欠落を生んでいる**。`requests/page.tsx:12` は `openGraph: { url: '/requests' }` だけを定義するため、親の `images` / `siteName` / `type` / `locale` が引き継がれない。ビルド成果物での実測:

```
（/requests.html）
<meta property="og:title" content="調査依頼一覧 | ザリダス"/>
<meta property="og:description" content="秋田県内の外来種調査依頼を一覧で確認・絞り込みできます。"/>
<meta property="og:url" content="（.../requests）"/>
  ← og:site_name / og:locale / og:type / og:image（4タグ）がすべて存在しない
```

比較のため、`openGraph` を定義していない `/trends` には og:site_name・og:locale・og:type・og:image・og:image:width・og:image:height・og:image:alt が**出ている**。つまり `/requests` は「og:url は正しくなったが、共有カードから画像が消えた」状態にある。Facebook / LINE / Slack では画像なしの小さなカードになり、X では後述の twitter:image が親から継承されているため画像が出る、という媒体間で挙動が食い違う中途半端な状態である。

これは問題Aの修正方針に直接影響する。**7ページに `openGraph: { title, description, url }` だけを足すと、7ページすべてが `/requests` と同じ「OG画像を失った」状態になる**。`lp/page.tsx:18-21` が警告しているのはまさにこの罠であり、ページごとに全フィールドを手書きさせる方式では同じ事故が再発する。
