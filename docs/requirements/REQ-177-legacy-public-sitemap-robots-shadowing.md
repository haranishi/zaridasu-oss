# REQ-177: Vite 時代の静的 `public/sitemap.xml` ・ `robots.txt` が動的版を本番で上書きしている

## 背景

ザリダスは過去に Vite SPA（Netlify ホスティング）として構築され、その後 Next.js 15 App Router（Vercel）へ移行した。移行時に Next.js 側で `src/app/sitemap.ts`（REQ-043 / REQ-162）と `src/app/robots.ts` による動的な `/sitemap.xml`・`/robots.txt` 生成を実装したが、**Vite 時代の静的ファイルが `public/` 配下に削除されず残存**している。

Next.js は `public/` 配下の静的ファイルを App Router のルートハンドラ（`sitemap.ts` / `robots.ts`）より優先して配信する。そのため本番では古い静的ファイルが配信され、動的版が出力する最新のサイトマップ／robots が**一切ユーザー・検索エンジンに届かない**。

`next build && next start` 後の `curl http://localhost:3000/sitemap.xml` で、動的版（25エリア＋承認投稿＋ `/lp` 等を含む）ではなく `public/sitemap.xml`（3 URL のみ）が返ることを実測済み。

## 現状の問題

（ファイルパス:行番号つき）

1. **静的 `public/sitemap.xml`（3 URL のみ）が動的版を上書き**
   - `public/sitemap.xml:1-18`：`https://zaridasu.com/`・`/about`・`/trends` の 3 URL のみをハードコード。
   - これに対し動的版 `src/app/sitemap.ts:26-91` は「8 静的ページ（`/lp`・`/ranking`・`/area`・`/terms`・`/privacy` を含む）＋ 25 エリアページ（`MUNICIPALITY_DATA`）＋承認済み投稿（最大 40,000）＋公開調査依頼（最大 5,000）＋公開プロフィール（最大 5,000）」を出力する。
   - 結果、**全承認投稿・25 エリアランディングページ・`/lp`（REQ-176）・`/ranking`・`/area` がサイトマップから消失**し、検索エンジンにインデックス対象として通知されていない。

2. **静的 `public/robots.txt` が動的 `robots.ts` を上書き**
   - `public/robots.txt:1-11`：`Disallow: /admin/`・`/admin/login`・`/admin/posts`・`/admin/reports`・`/admin/users`・`/dashboard`・`/offline` を列挙。`Sitemap: https://zaridasu.com/sitemap.xml` を指す。
   - 動的版 `src/app/robots.ts:4-13` は `disallow: ['/admin/', '/dashboard', '/auth/callback']` を出力する。すなわち**動的版が新たに追加した `/auth/callback` の Disallow が本番に反映されていない**（認証コールバック URL がクロール対象として露出しうる）。
   - 2 つの定義が乖離しており、どちらが正かが運用上不明瞭。

3. **`public/opensearch.xml` が旧ドメイン `zaridasu.vercel.app` をハードコード**
   - `public/opensearch.xml:6-7`：検索テンプレート URL と favicon URL が `https://zaridasu.vercel.app/...` を指す。現行の本番ドメインは `zaridasu.com`（`src/lib/constants` の `BASE_URL`、および `public/robots.txt`・`public/sitemap.xml` の表記と不一致）。OpenSearch 経由のブラウザ検索が旧ドメインへ誘導される。

4. **Netlify 遺物 `public/_redirects` が残存**
   - `public/_redirects:1`：`/*    /index.html   200`（Netlify の SPA フォールバック設定）。Vercel + Next.js では無意味で、誤って `index.html` SPA フォールバックの存在を示唆する紛らわしいファイル。実害はないが移行の取り残しとして整理対象。

## 目的

Next.js 動的版（`sitemap.ts` / `robots.ts`）の出力が本番でそのまま配信される状態に戻し、全承認投稿・25 エリアページ・`/lp` を含む正しいサイトマップを検索エンジンに提供する。あわせて旧ドメイン参照と Netlify 遺物を除去し、移行の取り残しを解消する。

## 要件

### 機能要件

- [ ] FR-177-01: `public/sitemap.xml` を削除する。削除後、`next build && next start` 後の `curl -s http://localhost:3000/sitemap.xml` が `src/app/sitemap.ts` 由来の動的出力（`/lp`・25 エリア URL・承認投稿 URL を含む XML）を返すことを確認する。
- [ ] FR-177-02: `public/robots.txt` を削除する。削除後、`curl -s http://localhost:3000/robots.txt` が `src/app/robots.ts` 由来の出力（`Disallow: /admin/`・`/dashboard`・`/auth/callback` と `Sitemap: https://zaridasu.com/sitemap.xml`）を返すことを確認する。
- [ ] FR-177-03: `public/_redirects`（Netlify SPA フォールバック）を削除する。
- [ ] FR-177-04: `public/opensearch.xml:6-7` の旧ドメイン `https://zaridasu.vercel.app` を現行ドメイン `https://zaridasu.com` に修正する（テンプレート URL・favicon URL の両方）。ハードコードを避け、可能なら本番ドメインを単一の出所（`BASE_URL` 相当）に揃える方針を検討する。`public/opensearch.xml` 自体は静的ファイルとして残す（動的版は存在しないため削除しない）。
- [ ] FR-177-05: 動的 `robots.ts`（`disallow`）と削除前の静的 `robots.txt` の差分を確認し、静的版にあって動的版に欠けている保護パス（`/offline` 等）が意図的な除外かを判断する。`/offline` をクロール禁止に保ちたい場合は `src/app/robots.ts` の `disallow` 配列に追記してから静的版を削除する（保護範囲を後退させないこと）。
- [ ] FR-177-06: 削除対象ファイルが他から参照されていないことを確認する（`public/_redirects`・`public/sitemap.xml`・`public/robots.txt` への明示参照がコード・ドキュメントに無いことを grep で確認）。

### 非機能要件（運用）

- [ ] NFR-177-01: 本番反映（Vercel デプロイ）後に Google Search Console（GSC）でサイトマップ `https://zaridasu.com/sitemap.xml` を再送信する運用手順を残す。旧 3 URL のみのサイトマップがキャッシュされている可能性があるため、再クロールを促す。

## 受入条件

- [ ] AC-01: `npm run build && npm run start` 後、`curl -s http://localhost:3000/sitemap.xml | grep -c '<loc>'` が 8（静的ページ）＋ 25（エリア）＋ローカルの承認投稿数を反映した値となり、最低でも `/lp`・`/area/akita`（例）・`/ranking` の各 URL が含まれる。
- [ ] AC-02: 同環境で `curl -s http://localhost:3000/robots.txt` が `Disallow: /auth/callback` を含み、`Sitemap: https://zaridasu.com/sitemap.xml` を指す。
- [ ] AC-03: `public/sitemap.xml`・`public/robots.txt`・`public/_redirects` がリポジトリから削除されている。
- [ ] AC-04: `public/opensearch.xml` 内に `zaridasu.vercel.app` 文字列が存在しない（`grep -r 'zaridasu.vercel.app' public/` が 0 件）。
- [ ] AC-05: `/offline` 等、静的 robots に存在した保護パスが意図せずクロール許可に後退していない（FR-177-05 の判断結果がコメントまたはコミットメッセージに記録されている）。

## 影響範囲

**削除対象ファイル:**
- `public/sitemap.xml`
- `public/robots.txt`
- `public/_redirects`

**変更対象ファイル:**
- `public/opensearch.xml`（旧ドメイン修正）
- `src/app/robots.ts`（FR-177-05 で `/offline` 等を追記する場合のみ）

**他機能への影響:**
- SEO（検索エンジンのインデックス対象が一気に増える＝意図どおり）。
- REQ-176（`/lp`）がサイトマップに正しく載るようになる（現状 `sitemap.ts:29` に定義済みだが配信されていない）。
- 認証フロー（`/auth/callback` のクロール禁止が有効化される）。
- ブラウザの OpenSearch 検索（旧ドメイン誘導の解消）。
- アプリ本体のコード挙動への影響はなし（静的アセットの整理のみ）。

## 優先度
- **緊急度**: Critical / **重要度**: High
- **理由**: 動的サイトマップ・robots の実装（REQ-043/162、REQ-176 の `/lp` 登録を含む）が**本番で完全に無効化**されており、全承認投稿・25 エリアページ・LP が検索エンジンに通知されていない。SEO・自然流入・卒研の参加者募集（H2 検証のユーザー獲得）に直接の機会損失。修正はファイル削除と 1 ファイルのドメイン修正のみでリスクは極めて低く、効果は即時かつ広範。
