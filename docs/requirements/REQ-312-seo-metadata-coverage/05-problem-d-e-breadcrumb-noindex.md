### 問題D: 種別ページのパンくずが `/about` を「種類図鑑」と表示するが、遷移先の h1 は別名 — Low

`src/lib/seo.ts:135` の BreadcrumbList:

```
{ '@type': 'ListItem', position: 2, name: '種類図鑑', item: `${BASE_URL}/about` },
```

および可視パンくず `src/app/species/[species]/page.tsx:101-105`（`<Link href="/about">種類図鑑</Link>`）に対し、遷移先 `src/views/AboutPage.tsx:73` の `<h1>` は `t('about.title')` = **「このサービスについて」**（`src/locales/ja/translation.json` の `about.title` を実測）。JSON-LD と可視パンくずの両方が、遷移先ページの主見出しと異なる名前を提示している。Google のパンくずガイドライン（各項目名が遷移先ページを表すこと）から外れる。

加えて `/about` の metadata title は `'使い方・種類図鑑・外来種法'`（`about/page.tsx:10`）と3主題が混在しており、種ピラーページ（REQ-227）の親としては弱い。

### 問題E: 管理画面の noindex — **監査時の前提が成立しないことを確認済み（訂正）**

監査（a11y-seo S-6）は「管理画面11ページが metadata 未定義でルートの `robots: { index: true }`（`layout.tsx:38-41`）を継承しており、`admin/layout.tsx` に `robots: { index: false, follow: false }` を置くべき」と報告した。**この前提は現在のコードでは成立しない。**

`src/app/admin/layout.tsx:4-7` に既に

```
export const metadata: Metadata = {
  title: '管理画面',
  robots: { index: false, follow: false },
}
```

が存在する（`git show HEAD:src/app/admin/layout.tsx` で確認。導入は Next.js 移行コミット `7b4a623`）。`/admin` セグメントの layout で `robots` を宣言しているため、配下の `(protected)` ルートグループ（`admin/(protected)/layout.tsx` は metadata を持たない認可ゲートのみ）と各ページはこの値を継承する。したがって「配下一括 noindex（二重防御）」は**既に実装済み**である。

残る差分は次の2点で、いずれも実害はない。

- `src/app/admin/login/page.tsx:5` が `robots: { index: false, follow: false }` を**重複して**再宣言している（親と同値のため無害だが、親が効いていることが読み取れず「login だけ保護されている」と誤読させる）。
- この保証を固定化する検査が無い。`admin/layout.tsx` の `robots` を誰かが消しても、`robots.ts:16` の `disallow: ['/admin/']` はクロールを止めるだけで**インデックス禁止の保証ではない**（外部からの直リンク時）ため、静かに保護が弱まる。
