### 問題B: zod 16.5 kB(gzip) が Header→DrawerMenu→useProfile 経由で全ルートに混入（明文化された方針と矛盾） — Medium

`src/hooks/posts/useSurveyRequests.ts:118-121` には、このフックが home `/` の同期モジュールグラフに乗るため **zod を含む `schemas` を動的 import して `/` の perf-budget に zod を混入させない（NFR-213-01）** と明記されており、`:123` で実際に `await import` している。`src/lib/validation/schemas.ts:25-30` のヘッダコメントにも同じ方針が書かれている。

しかし**別経路で静的に入っている**。

```
HomePage → Header（静的 import）
        → Header.tsx:110 で <DrawerMenu> を常時描画
        → DrawerMenu.tsx:9  import { useProgress } from '@/hooks/useProfile'
        → useProfile.ts:4   import { profileUpdateSchema } from '@/lib/validation/schemas'
        → schemas.ts:30     import { z } from 'zod'
```

- 実測: チャンク `5653-4dbff05d3c57c260.js` = **64 kB raw / 16.5 kB gzip**（`ZodError` 5 / `ZodObject` 4 / `invalid_type` 10 / `too_small` 5 の出現で同定）。**`/`・`/post/[id]`・`/collection`・`/trends`・`/ranking`・`/dashboard` の主要6ルート全部の初期チャンクに含まれる。**
- DrawerMenu が `useProfile.ts` から使うのは `useProgress` だけで、**`useProgress` は zod を一切使わない**。zod を使うのは同ファイルの `useProfile.updateProfile` のみ（`useProfile.ts` は `useProfile` / `useRanking` / `useDiversity` / `useQuality` / `useProgress` / `useCollection` / `useBadgeDefinitions` を1ファイルに同居させている）。

つまり **「zod は同期グラフに載せない」という明文化された方針が、別経路で破られている**状態。バンドルサイズの問題であると同時に、方針とコードの乖離という設計整合性の問題でもある。

### 問題C: Leaflet CSS 14,806 bytes が地図の無い全ページにレンダーブロッキングで配信される — Low

`src/app/globals.css:4` の `@import 'leaflet/dist/leaflet.css' layer(utilities);` により Leaflet のスタイルがグローバル CSS に固定されている（REQ-026 で「集約先」として意図的に置かれたもの）。

- 実測: `node_modules/leaflet/dist/leaflet.css` = **14,806 bytes**。ビルド後の単一グローバル CSS `.next/static/css/d65277aa2c25d711.css` = **150,842 raw / 24,157 gzip**、うち `.leaflet-*` セレクタ **69 種**・文字列 `"leaflet"` の出現 **241 回**。
- `.next/server/app/lp.html` と `about.html` の**両方**がこの CSS を `<link>` している（href 確認済み）。したがって地図を描画しない **/lp・/about・/privacy・/terms・/dataset** でも Leaflet スタイル一式をレンダーブロッキングで読む。
- 対比として **MarkerCluster の CSS は正しく分割されている**（`react-leaflet-cluster/lib/index.js:31-32` が JS 側から `require` するため cluster チャンクと一緒に遅延取得され、`globals.css` への混入は 0 件）。**同じことを Leaflet 本体の CSS でもやれる**という根拠になる。

なお `globals.css:531-555` に Leaflet の上書きルール（`.leaflet-container` / `.leaflet-popup-content-wrapper` / `.leaflet-popup-content` / REQ-268 FR-268-06 のズームボタン 44px 化）があるため、移動時はこれらも同時に移す必要がある。

### 問題D: ja translation.json が単一 22.0 kB(gzip) チャンクで全ルート初期ロード — Low

`src/lib/i18n.ts:6`（`import ja from '@/locales/ja/translation.json'`）と `:72`（`resources: { ja: { translation: ja } }`）により、ja は単一 namespace で初期 embed される。

- 実測: **ja 79,783 B raw / 22,521 B gzip（常に含まれる）**、en 67,625 / 19,759、ko 75,657 / 21,556、zh 65,535 / 21,147（**en/zh/ko はいずれも遅延**）。チャンク `4600-a9fef37bfdc2fd20.js` = **22.0 kB gzip**（「ザリダス」14 回・「秋田」32 回で同定）が `/`・`/collection`・`/trends`・`/ranking`・`/dashboard` の初期チャンクに含まれる（**/lp には含まれない＝良好**）。
- **REQ-145 の多言語遅延化は正しく機能している**（`i18n.ts:32-46` の switch で en/zh/ko を個別チャンク化）。問題は ja 側が単一 namespace であること。
- ja は admin 管理画面・/dataset・図鑑・調査依頼など**全画面のキーを 1 ファイルに持つ**ため、**ホームだけを見るユーザーも管理画面の文言を全部ダウンロードする**。

費用対効果が最も高いのは **`admin.*` 配下の切り出し**（管理者は極少数なので、大多数のユーザーが不要な文言を落とせる）。

### 問題E: 種アイコン原本 PNG が 472 kB / 360 kB（最大表示は 36×36） — Low

- 実測: `public/images/bullfrog.png` = **472 kB** / `public/images/american.png` = **360 kB**。`public` 配下の実測合計 844 kB のうち **832 kB がこの 2 ファイル**（`du` で確認、他は `public/images/leaflet` の 12 kB のみ）。
- 消費側の表示サイズ: `MapView.tsx:513-519`（20×20）、`DetailPage.tsx:344-350`（**36×36 が最大**）、`MyPostsSection.tsx:156`（32×32）、`PendingPostsSection.tsx:103`（32×32）、`StatsBar.tsx:91`（16×16）。
- すべて `next/image` 経由なので**配信バイトは最適化される**。それでも問題が残る理由は3つ。
  1. 最大表示 36×36 に対し原本 472 kB は**変換前入力として過大**（リポジトリとビルド成果物に常に乗る）。
  2. **Vercel Image Optimization の初回変換コストが原本サイズに比例**する。
  3. Service Worker（`public/sw.js.tpl:70-77`）が `/images/` と `.png` を **cache-first** で拾うため、原本 URL が直接踏まれると **472 kB がそのまま端末にキャッシュ**される。

128×128 程度（Retina 2x の 64pt 相当）への再書き出しで推定 **約 -800 kB**。`og-image.png`（56 kB）/ `og-image-lp.png`（56 kB）は **OGP に 1200×630 が必要なためそのままで問題ない**。
