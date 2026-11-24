## 現状の問題
（ファイルパス:行番号 または 不在の事実）

### 1. 逆ジオコーディングは「市区町村 1 個」しか取り出さず、字・水系などの細かい情報を捨てている

- `src/hooks/useReverseGeocode.ts:35` で Nominatim の `reverse` を **クライアント（ブラウザ）から直接**叩く：
  ```ts
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${pos.lat}&lon=${pos.lng}&format=json&accept-language=ja`
  ```
- レスポンスからは **`city`/`town`/`village`/`county` のみ**を候補にし（`useReverseGeocode.ts:44`）、固定リスト `MUNICIPALITIES`（25 件、`src/lib/constants.ts:98-104`）に対し `candidate.includes(m) || m.includes(candidate)`（`useReverseGeocode.ts:46-48`）で最近傍マッチして 1 文字列に丸める。
- すなわち Nominatim が返す **`suburb`/`neighbourhood`/`hamlet`/`quarter`（＝字・大字・町丁目レベル）や `display_name`、近傍の水系/河川名ヒントは一切保持されない**。`addressdetails`/`extratags`/`namedetails` 等のパラメータも付けていない（`useReverseGeocode.ts:35` の URL に無い）。
- リクエストは `User-Agent: 'zaridasu/1.0 (https://zaridasu.com)'` を付与しているが（`useReverseGeocode.ts:37`）、**ブラウザの `fetch` では `User-Agent` ヘッダは仕様上ユーザエージェントが上書き/無視する**ため、Nominatim の「識別可能な UA 必須」要件を満たせていない可能性が高い (推測：環境依存)。また**呼び出しがクライアント分散**のため、全利用者合算での 1req/秒上限をサーバー側で担保できない。

### 2. キャッシュはセッション内・端末ローカルのみで、付与結果の永続化・再利用がない

- `src/lib/geocodeCache.ts` のキャッシュは **モジュールスコープの `Map`（インメモリ・LRU 100 件・TTL 1 時間、`geocodeCache.ts:5-9`）** で、`makeKey` は `lat.toFixed(3),lng.toFixed(3)`（≒100m 粒度、`geocodeCache.ts:12-14`）。**ページリロードで消える**（`geocodeCache.ts:8` コメント「リロードで消える」）。
- つまり**同じ地点でも利用者/セッションをまたぐと毎回 Nominatim を叩く**設計で、Nominatim 規約の「結果キャッシュ推奨」を端末内に閉じた範囲でしか満たせていない。**確定した地名を DB に保存して再利用する仕組みが無い**（後述 3）。

### 3. `posts` テーブルに字レベル地名・水系・標高・水辺フラグの列が無い

- `posts` の列は `id/created_at/lat/lng/species/info_type/municipality/comment/photos/...`（`supabase/schema.sql:13-41`）で、**地名は `municipality TEXT`（`schema.sql:20`）のみ**。字（locality）・水系名（water body）・河川名（river）・標高（elevation）・水辺フラグ（is_on_water / habitat type）に相当する列は**存在しない**。
- 型側も同様：`src/types/database.types.ts:11-27`（posts.Row）に `municipality: string | null` はあるが、字/水系/標高/水辺の各列は無い。アプリ型 `src/types/post.ts`・`src/types/index.ts:54,66,122` も `municipality` 止まり。
- `survey_sites`（定点サイト、`schema.sql:1446-1456`）も `municipality TEXT`（`schema.sql:1452`）のみで、水系/水辺の属性を持たない。eDNA・定点反復調査（REQ-174）の文脈では、定点サイトに水系・水辺種別が欲しい。

### 4. 地域ページ・地図・構造化データの地名表現が「市区町村名」止まりで情報密度が低い

- `src/app/area/[municipality]/page.tsx` は市区町村（`getMunicipalityBySlug` → `MUNICIPALITY_DATA` の代表座標、`constants.ts:113-139`）単位でページを静的生成（`page.tsx:12-13`、`revalidate=86400`＝`page.tsx:19`）し、`title`/`description`/`keywords` も市区町村名のみで構成する（`page.tsx:36-40,115`）。**字・水系などのロングテール語彙が本文・メタ・キーワードに無い**。
- 同ページの JSON-LD は `Dataset` の `spatialCoverage` に**市区町村の代表 1 点**（`muni.lat/muni.lng`、`page.tsx:104-108`）を入れるだけで、字・水系・水辺の `Place`/`additionalProperty` は無い（REQ-229 で強化予定の素材が現状存在しない）。
- 地図（`src/components/features/map/MapView.tsx`）・投稿詳細（`src/app/post/[id]/page.tsx`）でも、ポップアップ/見出しに出せる地名は `municipality` 止まり。

### 5. 外部地名 API を「サーバー側で集約して呼ぶ」基盤が逆ジオコーディング用に無い

- ザリダスには**サーバー側から外部 HTTP を叩く実績**はある：DB から `net.http_post`（pg_net）で Edge Function を起動（`supabase/migrations/20260425000004_notify_survey_request.sql:36`、`20260421000001_ai_analysis_webhooks.sql:14`）、Edge Function（`supabase/functions/analyze-image` 等）から Gemini を呼ぶ、`_shared/aiRateLimit.ts` で AI 呼び出しのレート制御、など。
- しかし**逆ジオコーディング（地名/水系/標高/水辺）をサーバー側で呼ぶ関数は存在しない**（`grep -rni "nominatim\|opencage\|geoapify\|onwater\|opentopodata\|reverse.?geocod\|elevation" supabase` ヒット 0 件）。現状は前述のとおりクライアント Nominatim のみ。
- そのため、(a) Nominatim 規約（1req/秒・UA 必須・bulk 禁止）の集中管理、(b) OpenCage/Geoapify への apiKey 付きフォールバック、(c) **CORS 不可の Open Topo Data（`25_Geocoding.md:84` で CORS=No）をブラウザから呼べない**問題、のいずれも解決できない。標高はサーバー側でしか取得できない。

### 6. データ品質チェック（水辺かどうか・市区町村の妥当性）に外部地理情報を活かせていない

- 投稿の位置妥当性チェックは**秋田県の矩形 BBOX**（`AKITA_BOUNDS = { latMin:38.8, latMax:40.7, lngMin:139.5, lngMax:141.8 }`、`constants.ts:64`）に入るかだけ（`usePostForm.ts:248-252`、EXIF 取り込み時も `usePostForm.ts:88-91`）。
- 「アメリカザリガニ／ウシガエルなのに地点が完全に陸（水辺から大きく外れる）」「`municipality` が地点と矛盾」といった**外れ値・誤投稿を、水辺フラグや逆ジオコーディング結果で検知する**手段が無い（OnWater 等の情報を持っていないため）。研究データとしての信頼性向上の余地。
