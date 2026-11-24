# REQ-181: LP（/lp）の OGP / Twitter Card メタデータ欠落の修正

## 背景

REQ-176 で新設したマーケティングLP `/lp` は、広告・SNS・チラシ（QRコード）流入の受け皿である（SC-176-01）。広告やSNSでリンクが共有された際、OGP（Open Graph Protocol）と Twitter Card がLPの内容に一致したカード（画像・タイトル・説明）を表示することが、クリック率・直帰率に直結する。REQ-176 NFR-176-13 でも「OGP画像（LP専用 og-image-lp.png 推奨、なければ既存流用）」が要件化されている。

Next.js App Router の `metadata` は、子セグメントの `openGraph` / `twitter` オブジェクトを**トップレベルキー単位の浅いマージ（shallow merge）**で扱う。子で `openGraph` を定義すると、親（root layout）の `openGraph` は**フィールド単位ではなくオブジェクトごと**置き換えられる。そのため子で `images` を省略すると、親の `images` は引き継がれず消える。

## 現状の問題

`src/app/lp/page.tsx:15-24` の `metadata` 定義:

```ts
export const metadata: Metadata = {
  title: { absolute: LP_TITLE },
  description: LP_DESCRIPTION,
  alternates: { canonical: '/lp' },
  openGraph: {
    title: LP_TITLE,
    description: LP_DESCRIPTION,
    url: `${BASE_URL}/lp`,
  },
}
```

- **OGP画像が消える**: `openGraph` に `images` が無い。root layout（`src/app/layout.tsx:22-30`）は `openGraph.images: [{ url: '/og-image.png', width: 1200, height: 630 }]`・`type: 'website'`・`locale: 'ja_JP'`・`siteName: 'ザリダス'` を定義しているが、LP側が `openGraph` をオブジェクトごと上書きするため、これら（images / type / siteName / locale）が**まるごと破棄**される。結果、`/lp` のビルドHTMLに `og:image` が出力されない。SNS共有時にサムネイル画像が表示されない。
- **Twitter Card がLP内容と不一致**: LP側に `twitter` ブロックが無い（`src/app/lp/page.tsx:15-24` に `twitter` キー無し）。root layout（`src/app/layout.tsx:31-36`）の `twitter` が継承され、`twitter:title` が「ザリダス - 秋田県外来生物情報マップ」、`twitter:description` がルートの文言になる。LP固有のタイトル「ザリダスとは - 見つけて、のせて、秋田の自然を守る無料マップ」（`src/app/lp/page.tsx:11`）と食い違う。
- これは REQ-176 NFR-176-13（独自 description・OGP画像）に違反する。広告・SNS流入の受け皿として、ファーストインプレッション（共有カード）が壊れている状態は致命的。

> 補足: `docs/archive/lp-copy.md` ⑨ で OGP は「og:title / og:description は本文と同一」「og:image は後日生成、それまで既存 /og-image.png を流用」と確定済み。現状は流用すら効いていない（画像が出ない）。

## 目的

`/lp` の OGP・Twitter Card を、LP固有の文言とブランド画像で正しく出力し、広告・SNS共有時に正しいプレビューカードが表示される状態にする。Next.js の shallow merge 仕様に起因する継承漏れを解消する。

## 要件

### 機能要件

- [ ] FR-181-01: `src/app/lp/page.tsx` の `metadata.openGraph` に `images` を明示する。暫定で既存の `/og-image.png`（1200×630）を指定し、将来 LP 専用画像（`/og-image-lp.png`、REQ-206 と連動）が用意でき次第そちらへ差し替える。
- [ ] FR-181-02: `metadata.openGraph` に `type: 'website'`・`siteName: 'ザリダス'`・`locale: 'ja_JP'` を明示し、root layout から継承していた値を復元する（shallow merge で消えるため再指定が必要）。
- [ ] FR-181-03: `metadata.twitter` ブロックを新設し、`card: 'summary_large_image'`・`title`（= `LP_TITLE`）・`description`（= `LP_DESCRIPTION`）・`images`（OGPと同一画像）をLP文言で定義する。
- [ ] FR-181-04: OGP・Twitter のタイトル/説明は、既存の定数 `LP_TITLE`（`src/app/lp/page.tsx:11`）・`LP_DESCRIPTION`（同 :12-13）を再利用し、文言の二重管理を避ける。
- [ ] FR-181-05: 画像の `alt` を OGP `images` に付与する（例: 「ザリダス - 秋田の外来生物マップ」）。`docs/archive/lp-copy.md` のトーンに沿った平易な文言とする。

### 非機能要件

- [ ] NFR-181-01: 画像パスは絶対URL解決が必要な場合 `metadataBase`（root layout:16 で `BASE_URL` 設定済み）に従い、相対 `/og-image.png` 指定のままでも絶対URLに展開されることを確認する。
- [ ] NFR-181-02: 既存のルート `/` の OGP（root layout）には影響を与えない（LP側 metadata の変更のみ）。

## 受入条件

- [ ] AC-01: `npm run build` 後、`/lp` の出力HTML（`.next` または `next start` 実機）に `<meta property="og:image" content="...og-image.png...">` が存在する。
- [ ] AC-02: 同HTMLに `<meta property="og:type" content="website">`・`<meta property="og:site_name" content="ザリダス">`・`<meta property="og:locale" content="ja_JP">` が存在する。
- [ ] AC-03: 同HTMLの `<meta name="twitter:title">` の content が `LP_TITLE`（「ザリダスとは - 見つけて、のせて、秋田の自然を守る無料マップ」）であり、ルートの「ザリダス - 秋田県外来生物情報マップ」ではない。
- [ ] AC-04: 同HTMLに `<meta name="twitter:card" content="summary_large_image">` と `<meta name="twitter:image">` が存在する。
- [ ] AC-05: `<meta property="og:title">` / `<meta property="og:description">` が `LP_TITLE` / `LP_DESCRIPTION` と一致する（既存の継承漏れがないことの確認）。
- [ ] AC-06: ルート `/` の OGP メタ（`og:title` = 「ザリダス - 秋田県外来生物情報マップ」）が変更されていない。

## 影響範囲

- `src/app/lp/page.tsx`（`metadata` のみ。本文・データ取得・JSON-LD は変更不要）
- 画像アセット: 暫定は既存 `public/og-image.png` を流用（新規作成なし）。LP専用画像作成は REQ-206 / NFR-176-13 側。
- DB・API・i18n への影響なし。

## 優先度

- **緊急度**: High / **重要度**: High
- **理由**: `/lp` は広告・SNS施策の着地点（REQ-176 の主目的）。OGP画像が出力されず Twitter Card がLP内容と不一致のままでは、共有・出稿のたびに第一印象が崩れ、クリック率・直帰率に直接の機会損失が出る。修正は metadata 数行で完結し、リスク・コストが極小（DB/ロジック変更なし）。
