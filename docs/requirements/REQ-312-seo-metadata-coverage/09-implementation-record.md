## 実装記録（2026-07-31）

### 実装したもの

| FR | 実装箇所 | 要点 |
|---|---|---|
| FR-312-01 | `src/lib/seo.ts:71` `buildPageMetadata({ path, title, description, titleAbsolute?, ogImage? })` | **`alternates.canonical` と `openGraph.url` を同一の `path` から生成**するため、片方だけ書き換わる退行が構造的に起きない。shallow merge で失われる `type` / `siteName` / `locale` / `images` を必ず再指定する（問題B の再発防止）。`path` が `/` 始まりでない場合と末尾 `/` 付きの場合は **throw** して canonical の揺れを入口で止める |
| FR-312-02 | `trends` / `ranking` / `area` / `about` / `terms` / `privacy` / `dataset` の7ページ | すべてヘルパー経由に移行 |
| FR-312-03 | `src/app/requests/page.tsx` | `openGraph: { url: '/requests' }` の部分定義をヘルパー経由に置換。og:image / og:site_name / og:type / og:locale を回復。`titleAbsolute` で REQ-199 FR-199-02 のブランド二重付与回避を維持 |
| FR-312-04 | `src/lib/seo.ts:55-61`（採用理由をコメントで明記） | **C-2（ページ側で明示）を採用**。C-1（root から `twitter.title` / `description` を外す）は og:image を持たないページで twitter:image まで落ち、root layout 全体の共有カードに影響する。本ヘルパーは og と twitter を**同一の入力からまとめて生成する**ため、C-2 でも二重記述にならず C-2 の唯一の短所が消える |
| FR-312-05 | `src/lib/seo.ts:29` `ABOUT_BREADCRUMB = { name: 'このサービスについて', path: '/about' }` | JSON-LD（`seo.ts:265`）と可視パンくず（`species/[species]/page.tsx:106`）が**同一定数から生成**。名前を遷移先 `/about` の h1（`about.title`＝「このサービスについて」）に合わせた＝要件の (a) 案 |
| FR-312-06 | `src/app/admin/layout.tsx:4-19` ＋ `src/app/admin/__tests__/admin-noindex.test.ts` | 「ここの `robots` が `/admin` 配下すべての noindex を担う」ことと「`robots.ts` の `disallow` はクロール制御であって noindex の保証ではない」ことをコメントで明記。`admin/login/page.tsx:5` の同値宣言は**無害な冗長宣言として残置**し、その旨を親のコメントに記載 |
| FR-312-08 | `src/app/__tests__/page-metadata.contract.test.ts`（207行） | 4本の検査。①解決結果の canonical / og / twitter 契約 ②**走査対象の page.tsx を実際に発見できていること**（走査自体の空振り検知）③ indexable な静的ページは `buildPageMetadata` 経由で書くこと ④ `openGraph` を手書きするページは url / images / twitter を併記すること ⑤免除リストが実在ページだけを指すこと（リネーム後の死んだ免除を残さない） |

### 実測による確認

ローカルビルド成果物の実HTMLで、og:url がページ別に出力されることを確認済み（ドメインはローカルビルドの `NEXT_PUBLIC_APP_URL` に依存。本番は `zaridasu.com`）。

```
/trends   → og:url content=".../trends"
/ranking  → og:url content=".../ranking"
/area     → og:url content=".../area"
/dataset  → og:url content=".../dataset"
```

テスト（2026-07-31 実測）: `page-metadata.contract.test.ts` / `seo.test.ts` / `admin-noindex.test.ts` の **3ファイル 53件が PASS**。

### 受入基準の到達状況

| AC | 判定 | 備考 |
|---|---|---|
| AC-01〜AC-03 | ✅ | 7ページ＋`/requests` の og:title / og:url / og:image 等をヘルパーで担保 |
| AC-04 | ✅ | C-2 採用。ヘルパーが twitter も同時生成 |
| AC-05 | ✅ | canonical と og:url が同一 `path` 由来。契約テストで固定 |
| AC-06 | ✅ | `ABOUT_BREADCRUMB` による単一ソース化 |
| AC-07 | ✅ | `admin-noindex.test.ts` が `admin/layout.tsx` の `robots` を固定 |
| AC-08 | ⏸ **保留** | → 次節。`/[locale]` ルーティングは本REQでは導入していない（要件どおり） |
| AC-09 | ✅ | sitemap / robots / canonical は REQ-275 の状態から退行なし |
| AC-10 | ✅ | `lint`（`--max-warnings 0`）/ `type-check` ともに緑 |

### ⏸ FR-312-07（多言語URL / hreflang）— **意思決定待ちのため未着手**

事実関係は本文「判断事項」節のとおりで、**追加調査は不要な状態まで揃っている**（4言語1277キーが完全一致・`[locale]` セグメント 0件・`hreflang` 0件）。残っているのは実装判断そのもの。

- **決めること**: en / zh / ko の検索流入を取りに行くか。
- **取りに行かない場合**: 追加作業なし。翻訳は揃っているので後から取りに行く余地は失われない。本節に「現状維持」と追記して本REQを閉じる。
- **取りに行く場合**: `/[locale]` ルーティング・全ページの `alternates.languages`・`x-default`・sitemap の言語別エントリを**別REQとして起票**する（canonical / sitemap / middleware / OG生成すべてに波及するため本REQには含めない）。

判断材料として押さえておくべき点: 主題が「秋田県の外来生物情報」という地域限定の市民科学であるため、想定読者を**在住外国人 / 海外の研究者 / 訪日者**のどれに置くかで費用対効果が大きく変わる。研究者向けであれば `/dataset`（オープンデータ配布ページ）だけを英語で持つ**部分的な多言語化**も選択肢になり、全ページのルーティング変更より工数がはるかに小さい。

> **本REQは FR-312-07 を除き完了。** この判断が付き次第、本節を更新して閉じる。
