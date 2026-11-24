## 受入基準

- **AC-01**: `/trends` `/ranking` `/area` `/about` `/terms` `/privacy` `/dataset` の7ページで、`og:title` がページ固有のタイトル、`og:url` が当該ページの絶対URL（`alternates.canonical` と同一）になっている。**ホームの文言・ホームのURLが残っていない。**
- **AC-02**: 上記7ページと `/requests` のすべてで `og:image` / `og:site_name` / `og:type` / `og:locale` が出力されている（問題Bの欠落が発生していない）。
- **AC-03**: `/requests` の `og:title`（「調査依頼一覧 | ザリダス」）と `twitter:title` が一致し、ページ固有になっている。
- **AC-04**: 問題Cの8ページで `twitter:title` / `twitter:description` がページ固有になっている。C-1 を選んだ場合は root の `twitter` から `title` / `description` が消え、og からのフォールバックで各ページ固有値が出ることを確認する。
- **AC-05**: `alternates.canonical` と `openGraph.url` が**同一の値から生成されている**（片方だけ書き換えられる箇所が残っていない）。新規ページを1本追加したときに両方が自動で揃うことを確認する。
- **AC-06**: 種別ページの可視パンくずと BreadcrumbList JSON-LD の position 2 の名前が、遷移先ページの `<h1>` と一致する。JSON-LD と可視パンくずの文字列が同一ソースから生成されている。
- **AC-07**: `/admin` 配下のページ（`/admin/posts` 等）に `noindex` が解決されることが検査で固定化されており、`admin/layout.tsx` の `robots` を削除するとその検査が落ちる。
- **AC-08**: 多言語URL（hreflang）についての判断が文書化されている。「取りに行く」場合は別REQが起票されている。**本REQのコミットで `/[locale]` ルーティングは導入しない。**
- **AC-09**: `sitemap.xml` / `robots.txt` / canonical の整合が REQ-275 の状態から退行していない（noindex ページが sitemap に載っていない・`/privacy` `/terms` が indexable のまま・`/api/og` の allow 例外が維持されている）。
- **AC-10**: `lint` / `type-check` / 既存652テストがパスする。

## 対象外（他REQとの線引き）

- **動的OG画像（`/api/og`）の各ページへの配線** → **REQ-276**（起票済み未実装）。本REQは静的な `/og-image.png` の欠落を埋めるところまでを扱う。
- **`/[locale]` ルーティングの実装** → FR-312-07 の判断結果に応じて別REQ。
- **`html lang` が SSR 段階で常に `ja` になる問題（A-13）** → **REQ-304**（支援技術向け文言のi18n化と言語属性の整合）。多言語URL導入時は FR-312-07 と接続する。
- **位置非公開投稿の JSON-LD が geo 0,0 を出力する問題（S-3）** → 本REQのスコープ外（構造化データの値の正しさであってメタデータの網羅性ではない）。起票先は監査インデックス（`REQ-290-315-audit-2026-07-30-index.md`）の対応表に従う。
- **`/about` の title が3主題混在で種ピラーの親として弱い問題の抜本解決（`/species` インデックスの新設）** → **REQ-227**。本REQは FR-312-05 (a) の名称整合までを扱う。

---
