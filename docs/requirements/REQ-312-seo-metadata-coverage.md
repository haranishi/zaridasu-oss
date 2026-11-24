# REQ-312: SEOメタデータの網羅（og:url継承・twitterカード・パンくず・管理画面noindex・多言語URL）

作成日: 2026-07-30
優先度: **P1** ／ 深刻度: **High**（問題A/B）〜Low ／ 種別: SEO
状態: **実装済み（2026-07-31）**。FR-312-01〜06・FR-312-08 は完了。**FR-312-07（多言語URL / hreflang）のみ意思決定待ちで保留**（→ 末尾「実装記録」）
関連: REQ-275（SEO・セマンティクス整合。FR-275-02 の部分修正が本REQの起点）, REQ-276（動的OG画像の配線・未実装）, REQ-199（メタデータ小修正・title の二重付与回避）, REQ-145（言語チャンク分割）, REQ-181/REQ-206（LP の OGP。shallow merge の前例）, REQ-227（種別ピラーページ）

## これは何か

共有カード（og / twitter）の情報がページ単位になっていない一群の欠陥を洗い出し、
ヘルパー新設で構造的に直した要件。詳細は `REQ-312-seo-metadata-coverage/` 配下に分割している。

## 目的・背景（要約）

canonical と sitemap・robots の整合は REQ-275 で回復済み。残っていたのは Next.js App Router の
metadata が `openGraph` / `twitter` を**トップレベルのキー単位で浅くマージする**ことに起因する欠陥で、
子が未定義なら親が丸ごと継承され（問題A）、部分定義すると親の残りが消える（問題B）。
根拠はコード読解に加え、ローカルビルド成果物 `.next/server/app/*.html` から実際の `<meta>` を抽出して確認している。

## 主要な決定事項（要点）

- **問題A**: `openGraph` 未定義の indexable 静的7ページ（trends / ranking / area / about / terms / privacy / dataset）が
  og:title・og:url をホームから継承。**Next.js はページの title から openGraph を自動補完しない**。
- **問題B**: `/requests` の `openGraph: { url }` 部分定義で og:image / site_name / type / locale が消失。
  7ページに url だけ足すと同じ事故が7件に増える。
- **解決の本体は FR-312-01 のヘルパ** `buildPageMetadata({ path, title, description, ... })`。
  **canonical と og:url を同一の path から生成**し、失われるフィールドを必ず再指定する。
- **twitter 方針は C-2（ページ側で明示）を採用**。ヘルパが og と twitter を同一入力から生成するため二重記述にならない。
- **問題E は訂正**: 管理画面の配下一括 noindex は `admin/layout.tsx` に**既に実装済み**（監査の前提が不成立）。残るのは検査での固定化のみ。
- **FR-312-07（多言語URL / hreflang）は判断と記録のみを要求**し、本REQでは `/[locale]` ルーティングを導入しない。
- 2026-07-31 時点で AC-01〜07・09・10 は達成、AC-08 のみ保留。契約テスト等 3ファイル 53件 PASS。

## 各部品

| ファイル | 内容 |
|---|---|
| [01-background-and-method.md](REQ-312-seo-metadata-coverage/01-background-and-method.md) | 背景（shallow merge の挙動と LP の前例）と、検証方法（ビルド成果物からの meta 抽出） |
| [02-problem-a-og-inheritance.md](REQ-312-seo-metadata-coverage/02-problem-a-og-inheritance.md) | 問題A: 静的7ページが og:url / og:title を親継承。対象一覧・継承元定義・実測・影響 |
| [03-problem-b-shallow-merge.md](REQ-312-seo-metadata-coverage/03-problem-b-shallow-merge.md) | 問題B: 部分定義により `/requests` の og:image 等 4タグが消失。修正方針への含意 |
| [04-problem-c-twitter-card.md](REQ-312-seo-metadata-coverage/04-problem-c-twitter-card.md) | 問題C: twitter カードが8ページで親継承。対応案 C-1 / C-2 の長所短所比較 |
| [05-problem-d-e-breadcrumb-noindex.md](REQ-312-seo-metadata-coverage/05-problem-d-e-breadcrumb-noindex.md) | 問題D（パンくず名と遷移先 h1 の不一致）と問題E（admin noindex は実装済みという訂正） |
| [06-multilingual-url-decision.md](REQ-312-seo-metadata-coverage/06-multilingual-url-decision.md) | 判断事項: 4言語UIに hreflang / ローカライズURLが無い件の事実関係と判断材料 |
| [07-functional-requirements.md](REQ-312-seo-metadata-coverage/07-functional-requirements.md) | 機能要件 FR-312-01〜08（ヘルパ新設・7ページ適用・requests 補完・twitter 統一・パンくず・noindex・多言語判断・退行検知） |
| [08-acceptance-and-out-of-scope.md](REQ-312-seo-metadata-coverage/08-acceptance-and-out-of-scope.md) | 受入基準 AC-01〜10 と対象外（REQ-276 / REQ-304 / REQ-227 等との線引き） |
| [09-implementation-record.md](REQ-312-seo-metadata-coverage/09-implementation-record.md) | 実装記録（2026-07-31）: FR 別の実装箇所と要点・実測確認・AC 到達状況・FR-312-07 保留の理由 |
