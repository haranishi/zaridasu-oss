# REQ-228: 種×地域の programmatic ページ `/area/[municipality]/[species]`

「秋田市 アメリカザリガニ」のような**種×地域の複合クエリ**に 1:1 で対応する下層ページを、既存 `/area/[municipality]` の配下に programmatic 生成する要件。**48通りを機械的に量産するのではなく、投稿実データがある組み合わせだけを index する品質ガードが主眼**。本文は逐語で分割済み（この入口は目次と目的のみ）。

## 目的
- 「秋田市 アメリカザリガニ」等の**種×地域の複合クエリ（ロングテール）**に 1:1 で対応する `/area/[municipality]/[species]` を、既存地域ページの下層として programmatic に生成し、検索流入の「面」を広げる。
- クエリ・ファンアウト（`04_…:96,175`）の受け皿として、親（地域）—子（種×地域）の内部リンクを双方向に張り、トピッククラスタを形成する。
- **薄いページの量産＝scaled content abuse（`04_…:92,133`）を確実に避ける**ため、投稿実データが存在する組み合わせのみを index 対象とし、0 件（または極小）の組み合わせは noindex か親 `/area/[municipality]` への canonical で隔離する。サイトマップには index 対象（自分自身が canonical なページ）のみを載せる。
- 既存 `/area/[municipality]`（2 種まとめ）は維持し、種で 1 段ぶん絞り込む下層として整合させる。

## 分割ファイル

- [01-background-and-current-issues.md](REQ-228-species-area-programmatic-pages/01-background-and-current-issues.md) — 背景（ロングテール戦略、クエリ・ファンアウト、scaled content abuse の警告、既存地域ページの実装パターン踏襲）と現状の問題1〜5（複合クエリ用URLが無い／sitemapに枠が無い／空の組み合わせ量産がスパムになる／種×地域用のnoindex・canonical分岐が無い／種スラッグの正規化が未整理）
- [02-requirements-and-cannibalization.md](REQ-228-species-area-programmatic-pages/02-requirements-and-cannibalization.md) — 機能要件 FR-228-01〜（種スラッグ確定、`generateStaticParams` で48通り、種で絞ったデータ取得と head-count、メタ・canonical・noindex、sitemap、内部リンク）、非機能要件、**カニバリゼーション回避（REQ-227 との境界・必須）**
- [03-acceptance-impact-and-priority.md](REQ-228-species-area-programmatic-pages/03-acceptance-impact-and-priority.md) — 受入条件、影響範囲、優先度

### 設計上の要点

- `[species]` は `american` / `bullfrog`（`src/lib/constants.ts` の `value`）に固定し、未知のスラッグは `notFound()`。
- `revalidate` は既存地域ページと揃えて `86400`。データ取得は既存クエリに `.eq('species', …)` を1つ足す形。
- **サイトマップには index 対象（自分自身が canonical なページ）のみを載せる**。0件・極小の組み合わせは noindex か親 `/area/[municipality]` への canonical で隔離する。
