## 機能要件

### 群1: 機械照合の拡張（`schema:check`）

- **FR-314-01（列挙値チェックのテーブル修飾化と対象拡張）**: `scripts/check-schema-types-sync.ts` の `CHECKS` を**テーブル修飾**（テーブル名＋列名でスコープする正規表現）に変え、`schemaAllowed()`（`:60-68`）が「最後の出現」を無条件採用する実装をやめる。`reason` が RLS ポリシーの `WITH CHECK`（`schema.sql:384`）ではなく**テーブルの CHECK 制約（`:359`）を見る**ようにする。そのうえで問題Dで挙げた未検証列（`posts.weather` / `posts.status` / `posts.location_disclosure` / `posts.geo_source` / `posts.survey_method` / `posts.location_source` / `badges.category` / `admin_logs.action` / `admin_logs.target_type`）を追加する。テーブル修飾化により `species`（posts=2値 / survey_requests=3値）も検査可能にする。
- **FR-314-02（数値・長さ上限の対検査）**: 同スクリプトに別ブロックを追加し、`constants.ts` の閾値定数と `schema.sql` のリテラルを対で照合する。最低限 `COUNT_MAX`(999) ↔ `schema.sql:45, 72`、`MAX_FILE_SIZE`(5242880) ↔ `schema.sql:663`、`SURVEY_DURATION_MAX`(480) ↔ `schema.sql:1607`、`MAX_COMMENT_LENGTH`(500) ↔ 対応する CHECK。**G-1 の `SURVEY_DAILY_LIMIT`(3) ↔ `schema.sql:2209` もここに含める**（含めない場合は FR-314-11 で削除する）。
- **FR-314-03（スクリプト自身の検査）**: 本REQで `check-schema-types-sync.ts` を拡張するため、**このスクリプトが lint / tsc の対象になっていない**という前提の問題（`tsconfig.json:41` の exclude ＋ `eslint.config.js` の files 指定でどのブロックにも一致しない）を踏む。スクリプト側の静的検査の有効化は **REQ-297 の担当**なので、本REQは REQ-297 の完了後に着手するか、少なくとも拡張したスクリプトが手動実行で緑になることを確認する。**実装順序の依存として明記する。**

### 群2: 述語・定数・列リストの単一化

- **FR-314-04（bbox 判定の単一化）**: `PostForm.tsx:156-157` / `usePostForm.ts:99-100` / `schemas.ts:95-105` の3つのインライン判定を `isWithinTargetBBox(lat, lng)`（`targetArea.ts:51-58`）に置き換える。**これにより `PostForm` の GPS 自動入力の境界が排他から包含へ変わる**（`latMin` ちょうどの地点で現在地が入るようになる）＝本REQで唯一の意図的な挙動変更。zod の `refine` は `isWithinTargetBBox` を呼ぶ形にし、エラーメッセージキー `validation.location.outOfBounds` は維持する。`targetArea.test.ts` の境界値ケース（`:48-49` の `latMin`/`lngMin` 包含、`:58-59` の外側、`:63` の NaN）が3経路すべての契約になる。
- **FR-314-05（Storage バケット名の集約と抽象の一本化）**: `post-photos` を `src/lib/storage.ts` の定数1箇所に集約し（`uploadAudio.ts:3` の `const BUCKET = 'post-audio'` と同じ形）、`.from('post-photos')` の13箇所と `'/post-photos/'` のパス解析4箇所をすべてそこから導出する。あわせて **`usePostForm` / `useAdminPosts` / `AdminReportsPage` / `useOfflineQueue` が `supabase.storage.from(...)` を直接叩いている経路を `src/lib/storage.ts` の関数（`uploadPhoto` / `deletePhotos` / `extractPhotoPath`）経由に寄せる**。写真アップロードは EXIF 除去（`processImage`・REQ-243 FR-243-04）を必ず通る経路に統一する。バケット名を書き換えたときに残る直書きが0件であることを `grep` で確認できる状態にする。
- **FR-314-06（select 列リストの定数化）**: `SURVEY_REQUEST_LIST_COLUMNS`（12列）と `AREA_POST_COLUMNS`（11列）を定数として定義し、`useSurveyRequests.ts:75, 156` と `area/[municipality]/page.tsx:80` / `area/[municipality]/[species]/page.tsx:104` から参照する。置き場所は REQ-142 の `src/lib/admin/columns.ts` の流儀に合わせる（admin 専用ディレクトリに置かない判断も可。その場合の配置理由をコメントに残す）。`display_lat` / `display_lng` のエイリアスと REQ-243 の理由コメントも定数側に1回だけ書く。
- **FR-314-07（実験キーの単一化 / G-2）**: `AdminExperimentsPage.tsx:83-84` の `<option>` を `Object.entries(EXPERIMENTS)`（`src/lib/experiments/index.ts:10-13`）から生成する。`:39` の初期値 `'ai_feedback'` も `EXPERIMENTS.aiFeedback` 参照にする。**`EXPERIMENTS` に実験を追加したら管理画面の選択肢に自動で出る**状態にする。

### 群3: 型の生成型導出

- **FR-314-08（`LocationSource` の生成型導出と EXIF 経路の修正）**: `src/types/index.ts:49` の `LocationSource` を `NonNullable<Post['location_source']>` に置き換える（`InfoType`＝`src/types/index.ts:16` と同じ REQ-148 の方式）。そのうえで `PostForm` に `selectExifPosition`（`setLocationSource('exif')`。`accuracy` は EXIF に精度情報が無いため `null`）を追加し、`PostForm.tsx:480` の `onApplyExif` から `selectManualPosition` ではなくこれを呼ぶ。**`locationSourceSchema` の `'exif'` 分岐が実際に到達するようになる。**
- **FR-314-09（`PostExtendedFields` の整理）**: `src/types/post.ts:99-141` から**生成型に存在する列を削除**し、上書き目的のフィールド（`ai_result: AIResult | null` など、生成型の `Json` を狭めるもの）だけを残す。`status?: string`（`:104`）/ `weather?: string | null`（`:112`）のように生成型より広い再宣言は撤去する。冒頭コメント（`:100-102`「DB定義にはまだ含まれていないが実際に存在するカラム」）を現況に合わせて書き換える。`PostWithAI`（`:143`）等の交差型の**外部から見た型は変えない**（現在の交差結果と等価であることを確認する）。

### 群4: デッドコードの削除または復活

- **FR-314-10（テストキャッシュの実クリア / G-4）**: `src/hooks/__tests__/useReverseGeocode.test.js:15` の `clearGeocodeCache: vi.fn()` モックを外し、`beforeEach` から**実関数**（`geocodeCache.ts:47`）を呼ぶ。`geocodeCache.ts:19` のモジュールスコープ `Map` がテストファイル間で共有されて偽陽性を生む経路を閉じる。
- **FR-314-11（未参照シンボルの処置）**: 問題Gの表に従って処置する。
  - **G-1 `SURVEY_DAILY_LIMIT`**: FR-314-02 の機械照合に含める。含めない判断をした場合は**削除する**（誤認を招くほうが害が大きい）。どちらにせよ「定数を直しても挙動が変わらない」状態を残さない。
  - **G-6 `isMediaRecorderSupported`（`src/lib/audio/permission.ts:57`）**: 削除する。
  - **G-5 `resetErrorReporter`（`errorHandler.ts:78`）**: **削除しない。** `errorHandler.test.js:132, 137, 163` から実際に呼ばれている。テスト専用ユーティリティである旨を1行コメントで明示するだけにする。
  - **G-3 `isWithinTargetBBox`**: FR-314-04 で参照が復活する。削除しない。
- **FR-314-12（Context フォールバックの可視化 / 問題H）**: `MapSettingsContext.tsx:53-64` と `ToastContext.tsx:15-20` の Provider 不在時の挙動を、**開発時に気づける形**にする。最小案は `process.env.NODE_ENV !== 'production'` のとき `console.warn`（本番の fail-soft は維持し、ユーザー影響を増やさない）。あわせて **DrawerMenu のヒートマップトグルが MapView へ伝わることを検証するテストを1本**追加し、Provider の外へ移動させたら落ちる状態にする。
- **FR-314-13（写真表示経路の一本化 / 問題I）**: I-1 / I-2 のいずれかを選び、**設定と実態の乖離を解消する**。
  - **I-1 を選ぶ場合**: `PostList.tsx` / `PostCard.tsx` / `StatsBar.tsx` を削除し、`src/lib/imageUtils.ts`（`toThumbnailUrl`）と `next.config.ts:29-33` の `render/image` remotePattern を撤去する。`PostCard.test.tsx`（9件）も削除するため**テスト総数が減る**（AC-11 参照）。**削除の前に REQ-308 が `PostList` の無限スクロール sentinel を参考実装として必要としないか確認する。**
  - **I-2 を選ぶ場合**: `PhotoGallery.tsx:87-94` / `DetailPage.tsx:434` を `toThumbnailUrl` 経由にし、当該 `next/image` を `unoptimized` にして二重変換を避ける。`PostCard.tsx:80-84` の 400px ソースに対する `sizes` 指定のアップスケール不整合も同時に直す。**Supabase Image Transformation が現在のプランで有効であることの確認を前提条件にする。**
  - どちらを選んだかと理由を、`next.config.ts` の REQ-147 コメントを更新する形で残す。
