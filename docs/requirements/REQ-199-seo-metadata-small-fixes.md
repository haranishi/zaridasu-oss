# REQ-199: SEO / 配信メタデータの小粒修正バンドル（タイトル二重ブランド・sitemap整合・PWAアイコン・画像キャッシュ）

## 背景
ザリダス (Next.js 15 App Router + Supabase) は `src/app/layout.tsx` の root metadata に `title.template = '%s | ザリダス'` を設定し、各ページが `title` 文字列を返すと自動でブランドが後置される構成になっている。この前提で個別ページ・サイトマップ・PWA アイコン・画像最適化設定を見直したところ、検索品質（GSC エラー・タイトル重複）と配信効率（画像再変換）に直結する小粒な不整合が複数残っていた。1 件ずつは軽微だが、いずれも数行で直せて効果が明確なため 1 つの REQ にまとめて扱う。

実コードを確認した上での現状は以下の通り（各 FR は独立して着手可能）。

## 現状の問題
（ファイルパス:行番号つき）

### 1. ホーム / 調査依頼一覧でブランド名が二重表示
`src/app/layout.tsx:17-20` で root metadata に
```ts
title: { default: 'ザリダス - 秋田県外来生物情報マップ', template: '%s | ザリダス' }
```
が定義されている。配下ページが `title: '...'`（文字列）を返すと template が適用され ` | ザリダス` が後置される。
- `src/app/(home)/page.tsx:5` は `title: 'ザリダス - 秋田県外来生物情報マップ'` を返すため、実出力は **「ザリダス - 秋田県外来生物情報マップ | ザリダス」** となり「ザリダス」が 2 回出る。
- `src/app/requests/page.tsx:4` は `title: '調査依頼一覧 — ザリダス'` を返すため、実出力は **「調査依頼一覧 — ザリダス | ザリダス」** となり「ザリダス」が 2 回出る。
- 比較対象として `/lp` は `title.absolute` を使い template を回避している（同手法で統一すべき）。

### 2. sitemap が noindex の公開プロフィールを最大 5,000 件送信（GSC エラー量産）
`src/app/sitemap.ts:78-89` は `user_profiles` の `is_public = true` を最大 `SITEMAP_LIMITS.profiles = 5000`（:13）件取得し `/profile/{id}` を URL として出力している。一方 `src/app/profile/[userId]/page.tsx:37` は `robots: { index: false }` を返しており、**sitemap に載せている URL を自分で noindex 指定している**。Google Search Console で「送信された URL が `noindex` タグによりブロックされました」エラーを大量に生む構成で、サイトマップの信頼度（クロールバジェット配分）を下げる。方針が一本化されていない（プロフィールを公開資産にするのか、プライバシー重視で除外するのか未決）。

### 3. 公開ページ `/requests`（調査依頼一覧）がサイトマップ未掲載
`src/app/sitemap.ts:26-36` の `staticPages` には `/`・`/lp`・`/trends`・`/ranking`・`/area`・`/about`・`/terms`・`/privacy` はあるが、公開されインデックス対象の `/requests`（`src/app/requests/page.tsx`、robots 無指定＝インデックス可）が含まれていない。個別の `/request/{id}` は :70-75 で出力されるが、一覧ハブ（内部リンクの起点）がサイトマップから漏れている。

### 4. apple-touch-icon が SVG かつ二重出力（iOS でホーム画面アイコンが崩れる）
- `src/app/layout.tsx:41-44` の `icons` で `icon: '/icon-192.svg'`・`apple: '/icon-192.svg'` を指定（Next.js が `<link rel="apple-touch-icon">` を自動生成）。
- 加えて `src/app/layout.tsx:81` に手書きの `<link rel="apple-touch-icon" href="/icon-192.svg" />` があり、**apple-touch-icon が二重出力**されている。
- iOS Safari は `apple-touch-icon` の SVG を非対応で、ホーム画面追加時にページのスクリーンショットがアイコン化される（ブランドアイコンが出ない）。
- `public/` 配下には `icon-192.svg` と `icon-512.svg` のみで、PNG / 180×180 の apple-touch-icon が存在しない（`ls public/` で確認）。
- `src/app/manifest.ts:18-35` の `icons` も 192 / 512 がすべて `image/svg+xml` で、PNG 版を併記していないため一部 Android / PWA インストール環境でアイコンが出ないリスクがある。

### 5. next/image の `minimumCacheTTL` 未設定（投稿写真の AVIF/WebP 再変換が繰り返される）
`next.config.ts:13-30` の `images` は `formats: ['image/avif', 'image/webp']` と `remotePatterns` を設定するが `minimumCacheTTL` を指定していない。Next.js の Image Optimization のデフォルト TTL は短く（バージョンにより 60 秒〜）、Supabase Storage 上の投稿写真は **不変パス（投稿後に内容が変わらない）** であるにもかかわらず、TTL 失効のたびに AVIF/WebP への再変換が走り CPU と配信遅延を浪費する。

## 目的
- タイトルのブランド二重表示を解消し、検索結果でのタイトル品質を整える。
- サイトマップを「インデックス対象だけを過不足なく載せる」状態にし、GSC のエラーとクロールバジェットの浪費を止める。
- iOS / PWA でホーム画面アイコンが正しく表示されるよう apple-touch-icon を PNG・単一出力に正す。
- 不変な投稿写真の再変換を抑え、画像配信の CPU / レイテンシを削減する。

## 要件
### 機能要件
- [ ] FR-199-01: ホームのタイトル二重ブランドを解消する。`src/app/(home)/page.tsx:5` を `title: { absolute: 'ザリダス - 秋田県外来生物情報マップ' }`（`/lp` と同手法）へ変更し、root template の後置を回避する。最終出力が「ザリダス - 秋田県外来生物情報マップ」になること。
- [ ] FR-199-02: 調査依頼一覧のタイトル二重ブランドを解消する。`src/app/requests/page.tsx:4` を `title.absolute` でブランド名を 1 回だけ含む形（例: `{ absolute: '調査依頼一覧 | ザリダス' }`）に変更し、「| ザリダス」の二重付与を無くす。
- [ ] FR-199-03: sitemap とプロフィールの index 方針を一本化する。**推奨**は `src/app/sitemap.ts:78-89` の公開プロフィール出力（`profileUrls`）を削除し、プライバシー重視で sitemap から除外する（`SITEMAP_LIMITS.profiles` も整理）。**代替案**として公開プロフィールを資産化する場合は `src/app/profile/[userId]/page.tsx:37` の `robots: { index: false }` を撤去し、sitemap 掲載と index を一致させる。いずれか一方を採用し、sitemap と robots の指示が矛盾しない状態にする。
- [ ] FR-199-04: `/requests` をサイトマップに追加する。`src/app/sitemap.ts:26-36` の `staticPages` に `{ url: \`${BASE_URL}/requests\`, changeFrequency: 'weekly', priority: 0.6 }` 程度で追加する。
- [ ] FR-199-05: apple-touch-icon を 180×180 PNG・単一出力にする。180×180 の PNG（例 `public/apple-touch-icon.png`）を追加し、`src/app/layout.tsx:41-44` の `icons.apple` を当該 PNG へ変更、`src/app/layout.tsx:81` の手書き `<link rel="apple-touch-icon">` を削除して二重出力を解消する（icons メタデータからの自動生成に一本化）。
- [ ] FR-199-06: PWA マニフェストに PNG アイコンを併記する。192×192 / 512×512 の PNG を追加し、`src/app/manifest.ts:18-35` の `icons` に SVG と並べて PNG（`type: 'image/png'`、`purpose: 'any'` および `maskable`）を加える。
- [ ] FR-199-07: `next.config.ts:13-30` の `images` に `minimumCacheTTL: 2678400`（31 日 = 31×86400）程度を追加し、不変な投稿写真の AVIF/WebP 再変換頻度を下げる。

### 非機能要件（該当する場合のみ）
- [ ] NFR-199-01: 追加するアイコン PNG は `public/` 配下の静的アセットとし、`next.config.ts` のキャッシュヘッダ運用（`/images/*` の immutable など）と矛盾しないこと。ファイルサイズは妥当な範囲に最適化する。
- [ ] NFR-199-02: タイトル変更は OGP / Twitter カードの `title`（layout の openGraph/twitter）には影響させず、`<title>` の文言のみを是正すること。

## 受入条件
- [ ] AC-01: `/`（ホーム）の `<title>` が「ザリダス - 秋田県外来生物情報マップ」となり「ザリダス」が 1 回だけ含まれる（ビュー ソースまたは Playwright で確認）。
- [ ] AC-02: `/requests` の `<title>` に「ザリダス」が 1 回だけ含まれ「| ザリダス | ザリダス」のような重複が無い。
- [ ] AC-03: `/sitemap.xml` 内に `/profile/` を含む URL が存在しない（除外案採用時）か、もしくは `/profile/[userId]` の robots が index 許可になっている（資産化案採用時）。sitemap と robots の指示が矛盾しない。
- [ ] AC-04: `/sitemap.xml` に `${BASE_URL}/requests` の `<loc>` が含まれる。
- [ ] AC-05: 生成 HTML の `<head>` に `apple-touch-icon` の `<link>` が 1 つだけ存在し、その `href` が PNG（180×180）を指す。
- [ ] AC-06: `/manifest.webmanifest`（manifest.ts の出力）に `type: "image/png"` のアイコンが少なくとも 192 と 512 で含まれる。
- [ ] AC-07: `next.config.ts` の `images.minimumCacheTTL` が設定され、`next build` が成功する。投稿写真の `/_next/image` レスポンスの `Cache-Control` が 60 秒より長い TTL を反映する。

## 影響範囲
- `src/app/(home)/page.tsx`（ホーム title）
- `src/app/requests/page.tsx`（依頼一覧 title）
- `src/app/sitemap.ts`（profile 除外 or 追加、/requests 追加）
- `src/app/profile/[userId]/page.tsx`（資産化案を採る場合のみ robots 変更）
- `src/app/layout.tsx`（icons.apple、手書き apple-touch-icon link 削除）
- `src/app/manifest.ts`（PNG アイコン併記）
- `next.config.ts`（images.minimumCacheTTL）
- `public/`（apple-touch-icon.png ほか PNG アイコンの追加）

## 優先度
- **緊急度**: Medium / **重要度**: Medium / **理由**: いずれも本番動作を壊すバグではないが、(2)(4) は実ユーザー / 検索エンジンに見える品質低下（GSC エラー量産・iOS でブランドアイコンが出ない）であり、(1)(3) はタイトル重複・内部リンク漏れで SEO 効果を取りこぼす。(5) は配信コスト。修正コストはどれも数行で、まとめて対応する費用対効果が高い。
