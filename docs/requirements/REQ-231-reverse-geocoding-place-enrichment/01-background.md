## 背景

ザリダス（秋田県の外来生物＝アメリカザリガニ／ウシガエル 市民科学情報マップ、卒研 PF。Next.js 15 App Router + Supabase SSR + Vercel、地図は Leaflet/OpenStreetMap）は、投稿ごとに `lat`/`lng` と `municipality`（市区町村）を保持する。**この `municipality` は、外部の逆ジオコーディング（Nominatim）を「投稿フォームのクライアント側」で 1 回呼んで取得した結果を、固定の市区町村リストに最近傍マッチさせて確定している**（実装の詳細は「現状の問題」に行番号付きで示す）。

> 注: 本 REQ の当初メモには「市町村判定は Supabase 自前の境界ポリゴン（ST_Contains 等）で実施」とあったが、**実コードを確認した結果これは誤りだった**。`supabase/schema.sql`・`supabase/migrations/` 全体に `ST_Contains` / `ST_Within` / `polygon` / PostGIS 境界判定は**存在しない**（`grep -rn "ST_Contains\|ST_Within\|polygon\|PostGIS" supabase` ヒット 0 件。`municipality` は単なる `TEXT` 列＝`schema.sql:20`）。実態は「クライアント側 Nominatim → 文字列マッチ」である。以降は実装に即して記述する。

現状の逆ジオコーディングは **「市区町村名 1 個だけ」を取り出して捨ててしまっている**。Nominatim のレスポンスには字（あざ）・大字・町丁目（`suburb`/`neighbourhood`/`hamlet`/`quarter`）など、より細かい地名や、近傍の水系・河川名のヒントが含まれるが、ザリダスはそれらを保存していない。また「その地点が水上か陸上か（水辺フラグ）」「標高」も持っていない。外来生物（特にアメリカザリガニ・ウシガエル）の分布は水系・水辺と強く結びつき、**eDNA（環境 DNA）研究では「どの水系・どの止水/流水か」が観測の核心的メタデータ**になる。字レベル地名・水系名・水辺フラグが無いことは、(a) データ品質（研究利用・地図表示・重複/外れ値検知）と (b) 地名ロングテール SEO・地域ページの情報密度の両面で機会損失になっている。

本 REQ は、Obsidian `02_notes/公開API一覧/25_Geocoding.md`（Geocoding カテゴリ 94 件）が挙げる外部 API を下敷きにする。具体的には:

- **Nominatim**（`https://nominatim.org/...`、Auth=No・HTTPS=Yes・CORS=Yes／OSM ベースの世界全域 forward/reverse geocoding）— **現に使用中**。字・水系名の抽出元として活用余地が大きい。
- **OnWater**（`https://onwater.io/`、Auth=No）— lat/lon が**水上か陸上か**を判定する。水辺フラグの一次情報源候補。
- **Open Topo Data**（`https://www.opentopodata.org`、Auth=No・**CORS=No**）— lat/lon の**標高・水深**。CORS 不可のため**サーバー側（Edge Function / DB）からのみ**呼べる。
- **OpenCage**（`https://opencagedata.com`、`apiKey`・CORS=Yes）／**Geoapify**（`https://www.geoapify.com/api/geocoding-api/`、`apiKey`・CORS=Yes）— 商用・高頻度向けの reverse geocoding。Nominatim の利用規約上限を超える運用や、フォールバックに使う。

> **Nominatim の利用規約（重要・本 REQ の制約の中核）**
> Nominatim の Usage Policy は **「絶対上限 1 リクエスト/秒」「識別可能な User-Agent または HTTP Referer 必須」「結果のキャッシュ推奨」「大量・系統的（bulk/systematic）な利用はセルフホスト推奨、公開サーバでの一括処理は禁止」** を課す。ザリダスのような「投稿が増えるほど呼ぶ回数が増える」用途は、放置すると規約違反・IP ブロックのリスクがある。したがって本 REQ は **商用/高頻度になる場合は OpenCage/Geoapify（apiKey）への切替**、および**サーバー側での集約・スロットリング・キャッシュ**を前提条件として設計する。

> **境界（隣接 REQ との重複回避）**
> - 既存の**市区町村判定（クライアント Nominatim → 文字列マッチ）は維持・補完**する。本 REQ はそれを置き換えるのではなく、**字レベル地名・近傍水系名・水辺フラグ（＋任意で標高）を追加付与**して、データ品質と地名 SEO・地域ページ情報密度を上げることに集中する。
> - 付与した地名・水系は **REQ-229（Dataset/Place の JSON-LD・学名エンティティ連携）** の `spatialCoverage`/`Place` 強化と、**REQ-227/228（種別ピラー・種×地域 programmatic ページの地域 SEO）** の本文・内部リンク・ロングテール語彙に連携する（地名の産出元＝本 REQ、提示先＝229/227/228）。
> - **コスト/レート制限/利用規約**は **REQ-218（クラウド課金ガードレール）** と **REQ-212（公開エンドポイントの bot/レート制限）** の観点に整合させ、NFR に明記する。外部 API 呼び出しの「予算・暴走・kill switch」観点の主担当は REQ-218、入口の bot/頻度制限の主担当は REQ-212 で、本 REQ はそれらを**前提・参照**しつつ「逆ジオコーディング呼び出し自体のスロットリング/キャッシュ/フォールバック」を定義する。
> - **eDNA 研究の水系文脈**は本 REQ の動機として明記するが、eDNA データの取り込み・解析そのものは本 REQ の範囲外（将来 REQ）。

実コード／設定を確認したうえでの現状は以下のとおり。**「無い」ことは事実として明記**し、推測は (推測) と記す。
