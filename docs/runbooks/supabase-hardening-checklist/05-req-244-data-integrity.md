## REQ-244. 研究データ完全性 — 付与列汚染の既存データ扱い（FR-244-04）

REQ-244 で `protect_post_insert_columns` に「一般ユーザー INSERT 時のサーバ付与地理メタデータ列
（`locality`/`water_body`/`is_on_water`/`elevation_m`/`geo_enriched_at`/`geo_source`）の NULL 化」と
「`municipality` 許可リスト正規化」を追加した（正本 `supabase/schema.sql` ＋ migration
`20260703000002_research_data_integrity_insert_protection.sql`）。これは**今後の INSERT**の汚染を塞ぐもので、
改修前に一般ユーザーが自己設定した可能性のある既存行は自動では変わらない。本番の一括データ移行は必須ではなく、
必要に応じて以下で監査・再付与する（Nominatim 規約 1req/秒 を守り小分けに）。

1. **監査対象の抽出**（service_role / SQL Editor）
   - `geo_enriched_at` はあるが `geo_source` が正規値（`nominatim`/`opencage`/`geoapify`/`onwater`/`opentopodata`/`cache`）でない行
   - `geo_enriched_at` はあるが `geo_cache` に対応グリッド（`lat,lng` 3 桁丸め）が無い行
   - 改修デプロイ日時より前に `created_at` の行のうち付与列が非 NULL のもの
2. **null-and-re-enrich**（付与列を消してから再付与。`geo_enriched_at` が NULL に戻ると
   `private.trigger_enrich_place` の冪等ガードを通過し、正規の逆ジオ付与が再走する）:
   ```sql
   UPDATE posts
     SET locality=NULL, water_body=NULL, is_on_water=NULL,
         elevation_m=NULL, geo_enriched_at=NULL, geo_source=NULL
     WHERE id = ANY($1);   -- 監査で得た対象 id 群
   ```
   その後 enrich-place を対象 id で再実行（バッチは小分け）。
3. **軽微と判断する場合**は、当該列を公開データセット出力から一時除外する運用でも可
   （`src/app/dataset/zaridasu.csv/route.ts` の `SELECT_COLUMNS` 調整）。CSV 側は `csvCell` の
   数式無害化（REQ-244 FR-244-03）が二次防御として常時効く。

> 真の境界は DB 側の列保護（FR-244-01/02）。CSV 無害化（FR-244-03）は多層防御の二次線
> （REQ-213 の「真の境界は DB」方針に整合）。

---
