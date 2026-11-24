## 目的

- 投稿（および定点サイト）の `lat`/`lng` から、**字レベル地名（locality）・近傍水系名/河川名（water body / river）・水辺フラグ（is_on_water など habitat 区分）**、および**任意で標高（elevation）**を付与し、`posts`（必要に応じ `survey_sites`）に永続化する。
- 付与結果を **地域ページ・地図・投稿詳細・構造化データ**に流し、地名ロングテール SEO と地域ページの情報密度を上げる（提示は REQ-227/228/229 と連携）。
- Nominatim の**利用規約（1req/秒・UA 必須・bulk 禁止・キャッシュ推奨）を確実に守る**運用にする。具体的には**サーバー側集約＋スロットリング＋DB 永続キャッシュ**を基本とし、商用/高頻度時は **OpenCage/Geoapify（apiKey）へ切替/フォールバック**できる構成にする。CORS 不可の Open Topo Data は**サーバー側からのみ**呼ぶ。
- コスト/レート制限を **REQ-218（課金ガードレール）/ REQ-212（レート制限）** と整合させ、外部 API 呼び出しが暴走・規約違反・課金事故にならないガードを持つ。
- 水辺フラグ・逆ジオコーディング結果を**データ品質チェック**（外れ値・誤投稿の検知補助）にも使える素地を作る。

## 要件

### 機能要件

- [ ] FR-231-01（付与する地理メタデータ列の追加）: `posts` に以下を追加する（NULL 許容・後方互換、`schema.sql` と新規 migration の両方。既存 `municipality` は維持）。最低限:
  - `locality TEXT` — 字・大字・町丁目レベルの地名（Nominatim の `suburb`/`neighbourhood`/`hamlet`/`quarter` 等から選択）。
  - `water_body TEXT` — 近傍水系/河川/湖沼名（取得できた場合）。
  - `is_on_water BOOLEAN` — 水上=true / 陸上=false（OnWater 等の判定。取得不能は NULL）。
  - `elevation_m DECIMAL` — 標高（任意。Open Topo Data。取得不能は NULL）。
  - `geo_enriched_at TIMESTAMPTZ` / `geo_source TEXT` — 付与日時と情報源（`nominatim`/`opencage`/`geoapify`/`onwater`/`opentopodata` 等）。再付与・出典追跡用。
  列名・粒度は実装時に確定してよいが、**全列 NULL 許容で、未付与でも投稿は成立する**こと（既存投稿・オフライン投稿・付与失敗を壊さない）。`src/types/database.types.ts`（`supabase gen types`）とアプリ型（`src/types/post.ts` 等）も更新する。

- [ ] FR-231-02（サーバー側の逆ジオコーディング集約関数）: **Edge Function（例 `enrich-place`）** を新設し、`lat`/`lng` を受け取って (a) Nominatim reverse（`addressdetails=1` 等で字・水系を取得）、(b) 必要に応じ OnWater（水辺）、(c) 任意で Open Topo Data（標高、**CORS 不可なのでここで呼ぶ**）を呼び、上記列の値を返す/書き込む。**Nominatim 規約順守をこの関数に集約**する：識別可能な `User-Agent`（連絡先付き）をサーバーから付与、**全体で 1req/秒上限**を超えないスロットリング（後述 NFR）、結果を DB へ永続キャッシュ。クライアントから直接 Nominatim を叩く現状（`useReverseGeocode.ts:35`）は、**少なくとも字/水系/標高の取得についてはこのサーバー関数経由に寄せる**（市区町村のフォーム即時表示は既存クライアント呼び出しを残してよいが、規約順守の UA 問題（現状の問題 1）を踏まえ、可能ならこれもサーバー集約へ移行する方針を記す）。

- [ ] FR-231-03（付与のトリガングと非同期化）: 投稿確定（`posts` INSERT、`usePostForm.ts:296-339`）後に地理メタデータ付与を起動する。AI 解析が **posts INSERT トリガー → pg_net → Edge Function**（`migrations/20260421000001_ai_analysis_webhooks.sql`）で非同期実行されている既存パターンに倣い、**付与も非同期（投稿レスポンスをブロックしない）**で行う。付与失敗・タイムアウト時も**投稿自体は成功**とし（fail-open for enrichment、列は NULL のまま）、後から再付与できる（管理 UI かバッチ）。二重起動時は `geo_enriched_at` 等で**冪等にスキップ**する（AI の `ai_analyzed_at` 冪等ガード `analyze-image/index.ts` 相当の考え方）。

- [ ] FR-231-04（DB 永続キャッシュ／座標丸めによる呼び出し削減）: 付与結果を**座標グリッド単位で DB に永続キャッシュ**する（例 `geo_cache` テーブル：丸め座標キー＋付与値＋取得日時）。粒度は既存クライアントキャッシュの ≒100m（`geocodeCache.ts:12` の `toFixed(3)`）を参考に、研究/プライバシー要件と外部 API 負荷のバランスで決める。**同一グリッドは外部 API を再コールせずキャッシュから付与**し、Nominatim 規約「キャッシュ推奨」と REQ-218 のコスト削減に資する。TTL/再取得方針（地名はほぼ不変なので長め）を定義する。

- [ ] FR-231-05（フォールバックとプロバイダ抽象化）: 逆ジオコーディングのプロバイダを**抽象化**し、(a) 既定 Nominatim、(b) Nominatim がエラー/レート超過/規約上の高頻度に達したら **OpenCage または Geoapify（`apiKey`）へフォールバック**、を env で切替可能にする（例 `GEOCODE_PROVIDER`、`OPENCAGE_API_KEY`/`GEOAPIFY_API_KEY`）。**商用・高頻度運用に移行する場合は Nominatim 公開サーバを使わない**方針（規約「bulk はセルフホスト推奨」）を明記し、移行手順を残す。apiKey は秘密値として扱う（NFR）。

- [ ] FR-231-06（地域ページ・地図・詳細・構造化データへの反映）: 付与した字/水系/水辺/標高を提示に流す。
  - 地域ページ（`src/app/area/[municipality]/page.tsx`）: 当該市区町村に紐づく投稿の**字・水系をロングテール語彙**として本文/見出し/`keywords`（`page.tsx:115`）に集約表示する（地名の羅列でなく、件数の多い字・代表水系を要約）。**SEO の主担当は REQ-227/228**なので、本 FR は「素材（字・水系・水辺）を地域ページ/programmatic ページが参照できる形で供給する」ことに集中し、ページ設計の作り込みは 227/228 に委ねる。
  - 構造化データ: `Dataset` の `spatialCoverage`/`Place` に水系名・水辺種別等を足せるよう値を供給（**JSON-LD 設計の主担当は REQ-229**、本 FR は値の供給）。
  - 地図ポップアップ（`MapView.tsx`）・投稿詳細（`post/[id]/page.tsx`）: 取得できていれば「○○川／字○○／水辺」を補助表示（任意・最小実装）。

- [ ] FR-231-07（定点サイト・eDNA 文脈への拡張：任意）: `survey_sites`（`schema.sql:1446-1456`）にも水系名・水辺種別（止水/流水など）の列を追加できるようにする（REQ-174 の定点反復・eDNA の水系メタデータ要件に対応）。本 FR は**任意（nice-to-have）**とし、最小スコープでは `posts` への付与（FR-231-01〜06）を優先、定点サイトは将来拡張として設計余地だけ残してよい。

- [ ] FR-231-08（データ品質チェックの素地）: 付与した `is_on_water`／逆ジオ結果を使い、(a) 水生種なのに地点が水辺から大きく外れる投稿、(b) クライアント由来 `municipality` とサーバー逆ジオの市区町村が矛盾する投稿、を**フラグ/可視化**できる素地を作る（自動却下はしない＝fail-open、管理レビューの補助情報に留める）。実装は最小（列の付与＋管理 UI での表示）でよく、本格的な異常検知ロジックは将来 REQ に切り出してよい。
