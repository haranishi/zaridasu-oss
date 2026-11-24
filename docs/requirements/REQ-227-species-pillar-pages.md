# REQ-227: 種別ピラーページ `/species/[species]` の新設（programmatic SEO）

アメリカザリガニ／ウシガエルの情報収集型ロングテールを受け止める**種別ピラーページ `/species/[species]` を 0→1 で新設**する要件。トピッククラスター戦略のハブにあたる。本文は逐語で分割済み（この入口は目次と目的のみ）。

## 目的

- ザリダスに **種別ピラーページ `/species/[species]`（2 種）を新設**し、「アメリカザリガニ／ウシガエル」の情報収集型ロングテール（見分け方・駆除・法律・秋田での状況など）を 0 から獲得できる SEO 資産を立ち上げる。
- 既存の良質な種テキスト（`species_info` / `law_info` / 学名 FAQ）を再編・拡充して、**1 ページ 1 メインキーワード**の権威ページに仕上げる。
- 地域ページ・投稿詳細から種ページへの**内部リンク（クラスター→ピラー）を張り**、種テーマにオーソリティを集約する起点を作る。トピッククラスター（ピラー＝本 REQ、クラスター＝種×地域 REQ-228）の中核を据える。
- sitemap・パンくず・canonical・OGP/Twitter・最小 JSON-LD を `area` ページと同等水準で整備し、技術 SEO の抜けを作らない。
- 高度な構造化データ（Dataset/学名 sameAs）は REQ-229、種×地域の量産は REQ-228 に橋渡しできる土台（URL 設計・リンク枠・seo ヘルパ）を用意する。

## 分割ファイル

- [01-background-and-current-issues.md](REQ-227-species-pillar-pages/01-background-and-current-issues.md) — 背景（ピラー／クラスター／構造化データの役割分担、既存SEO系REQとの非重複、LPコピー方針、再利用できる `species_info` / `law_info`）と現状の問題1〜5（種別ページが無い／良質テキストの散在／種ハブ不在／sitemap に枠が無い／JSON-LD ヘルパが無い）
- [02-requirements.md](REQ-227-species-pillar-pages/02-requirements.md) — 機能要件 FR-227-01〜（ルート新設、メタデータ、本文構成、内部リンク、sitemap、JSON-LD）と非機能要件
- [03-acceptance-impact-and-priority.md](REQ-227-species-pillar-pages/03-acceptance-impact-and-priority.md) — 受入条件、影響範囲（新規追加・変更・担わない範囲・他機能への影響リスク）、優先度

### 境界（重複回避）

- **種 × 地域のクラスター量産は REQ-228**。本REQはピラー（種単独）のみ新設し、URL 設計とリンク枠だけ前方互換に用意する。
- **Dataset・学名 `sameAs` の構造化データは REQ-229**。本REQの JSON-LD は `BreadcrumbList` ＋種の `about`（`Thing`）まで。
- オープンデータ/DOI は REQ-230、種別 OG 画像の自動生成は REQ-181 / REQ-225 系（本REQは `/og-image.png` 流用で可）。
