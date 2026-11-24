## 受入条件

- [ ] AC-01: `posts` に字（locality）・水系（water_body）・水辺フラグ（is_on_water）・付与メタ（geo_enriched_at/geo_source）の列（＋任意で elevation_m）が**NULL 許容**で追加され、`database.types.ts` とアプリ型に反映されている。未付与の既存行・新規投稿が壊れない（E2E・既存集計が green）。
- [ ] AC-02: 投稿確定後に**サーバー側（Edge Function）で**字/水系/水辺（＋任意で標高）が付与され、対象列が埋まる。付与は**非同期で投稿レスポンスをブロックしない**。付与失敗/タイムアウト/kill switch でも**投稿は成功**し列は NULL のまま、後から再付与できる。
- [ ] AC-03（Nominatim 規約順守）: 逆ジオ呼び出しが **(a) サーバー側で全体 1req/秒を超えない**（同時複数付与でも合算で超えない）、**(b) 識別可能な User-Agent（連絡先付き）を付与**、**(c) DB 永続キャッシュで同一グリッドは再コールしない**、ことがコード/テストで確認できる。bulk バックフィルを Nominatim 公開サーバで無制限に走らせる処理が存在しない。
- [ ] AC-04（フォールバック）: `GEOCODE_PROVIDER`（または相当）で Nominatim→OpenCage/Geoapify を切替でき、Nominatim エラー/上限時にフォールバックする経路がテストで確認できる。apiKey は実値が露出しない（`.env.example` は変数名のみ）。
- [ ] AC-05（標高の CORS 制約）: 標高（Open Topo Data）を実装する場合、**サーバー側からのみ**呼んでいる（ブラウザから直接呼んでいない＝CORS 不可のため）。実装しない場合は「標高は任意・サーバー側のみ可」と本 REQ に記録されている。
- [ ] AC-06（提示への反映）: 地域ページ（`area/[municipality]/page.tsx`）または地図/詳細で、付与された字/水系/水辺が**参照・表示できる形で供給**されている。SEO 文面・JSON-LD への作り込みは REQ-227/228/229 に渡る素材として連携されている（地名の産出が本 REQ、提示の作り込みが 227/228/229 であることが明記されている）。
- [ ] AC-07（コスト・暴走防止）: 逆ジオ付与に**タイムアウト・リトライ上限＋バックオフ・kill switch**があり、kill switch で即停止できる（停止中も投稿成立）。OpenCage/Geoapify を使う場合の予算/異常検知が REQ-218 の運用に組み込まれている（重複実装なし、参照で整合）。
- [ ] AC-08（プライバシー）: 付与・キャッシュの座標粒度が定義され、過度に細かい座標や PII（`reporter_ip` 等）を外部 API/ログに残していない。外部 API へ送る座標が最小限である。
- [ ] AC-09（回帰・型）: `npm run schema:check`・既存テスト（`useReverseGeocode` 等）・E2E・Deno/TS 型チェックが全件 green。`schema.sql` と migration に本 REQ 由来のドリフトが無い。
