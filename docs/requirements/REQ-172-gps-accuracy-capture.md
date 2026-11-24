# REQ-172: GPS位置精度（accuracy）の取得・保存・表示・品質ゲート

## 背景
市民科学データを分布モデリング（SDM）に二次利用する際、観測点の位置精度はバイアスの主要因となる。Grady et al.（2026）ほか先行研究では、種分布モデルに供する在不在データは**位置精度 30m 以下が最低要件**とされ、農村部・水辺ではスマートフォン GPS の精度がばらつきやすいことが指摘されている。同レビューでは「測位精度が低い観測点はモデルから除外するか、精度メタデータを保持して重み付けに利用すべき」「投稿者に対し取得精度を可視化することで低精度投稿を抑止できる」とされている（Notion 先行研究レビュー RQ1「設計上の重要な注意点／データ品質バイアス対策」）。

ザリダスは秋田県のアメリカザリガニ・ウシガエル分布データを市民から収集しており、収集したデータは将来的に分布解析・CSV エクスポートを通じて研究・行政利用される想定である。しかし現状は GPS から得られる精度値（`accuracy`）を一切取得・保存しておらず、各観測点が SDM の最低要件（30m）を満たすかを後から判定できない。これはデータ品質バイアス対策上の欠落である。

## 現状の問題
- `src/components/features/posts/PostForm.tsx:139-149`: `navigator.geolocation.getCurrentPosition` のコールバックで `pos.coords` から `latitude` / `longitude` のみを取り出し（141 行目）、`pos.coords.accuracy`（メートル単位の水平精度）を破棄している。精度の閾値判定・視覚警告も存在しない。
- `src/hooks/usePostForm.ts:165-173`（`PostForm.tsx` 側の `postPayload` 構築）および `src/hooks/usePostForm.ts:292-325`（`submitPost` の `posts.insert`）に `accuracy` 相当のフィールドが無く、DB へ送られていない。
- `src/types/index.ts:42-45`（`LatLng`）・`src/types/index.ts:58-72`（`PostFormData`）に精度を保持するプロパティが無い。
- `src/types/database.types.ts` の `posts` テーブル（Row/Insert/Update）に `accuracy` 列が存在しない。
- `supabase/schema.sql:13-38` の `posts` テーブル定義に `accuracy` 列が無い。
- `src/components/features/posts/LocationSection.tsx:68-94`: 地図クリックによる**手動選択**（`LocationPicker`）と GPS 自動取得が同じ `position` に書き込まれ、両者を区別する手段が無い。手動選択点は GPS 精度が存在しないため、精度ありの GPS 点と混同される。
- `src/hooks/useCsvExport.ts:42,56-73`: エクスポート列に位置精度メタが含まれず、研究者が精度フィルタを掛けられない。
- `supabase/schema.sql:599-662` の `protect_post_status` および `supabase/schema.sql:664-` 付近の INSERT 保護トリガーは多数の運用制御列を OLD 固定／FALSE 強制しているが、`accuracy` を追加した場合の改竄方針が未定義。

## 目的
- GPS から水平精度 `accuracy`（メートル）を取得し、投稿ペイロード経由で DB に保存する。
- 投稿フォームで現在の取得精度を可視化し、低精度（>30m 注意／>50m 警告）を視覚的にユーザーへ提示してデータ品質を向上させる。
- 手動地図選択時は精度を「測位なし（手動）」として GPS 取得点と明確に区別する。
- 分布解析・CSV エクスポートで精度メタを利用可能にし、SDM 最低要件（30m 以下）でのフィルタ・重み付けを後工程で行えるようにする。

## 要件

### 機能要件
- [ ] FR-172-01: `PostForm.tsx` の `getCurrentPosition` コールバックで `pos.coords.accuracy`（メートル）を取得し、state（精度値）として保持する。`enableHighAccuracy: true` を `getCurrentPosition` オプションに追加する。
- [ ] FR-172-02: `LatLng`（または投稿状態）に `accuracy: number | null` と取得手段を識別するフラグ（例 `source: 'gps' | 'manual'`）を追加し、`PostFormData` まで貫通させる。
- [ ] FR-172-03: 手動地図選択（`LocationPicker` 経由の `setPosition`）が発火した場合、`accuracy = null`・`source = 'manual'` を設定し、GPS 由来の精度値を上書き・破棄する。GPS 取得点は `source = 'gps'`。
- [ ] FR-172-04: 投稿フォームに現在の取得精度を表示する。閾値: `accuracy <= 30m` は良好（緑）、`30m < accuracy <= 50m` は注意（黄）、`accuracy > 50m` は警告（赤）。手動選択時は「手動選択（精度なし）」と表示する。閾値は `src/lib/constants.ts` に定数（例 `GPS_ACCURACY_GOOD_M = 30` / `GPS_ACCURACY_WARN_M = 50`）として定義する。
- [ ] FR-172-05: `usePostForm.ts` の `postPayload` 構築と `posts.insert`、およびオフライン保存（`saveOffline` / `addPendingPost`）に `accuracy` を含める。手動選択時は `null` を送る。
- [ ] FR-172-06: `supabase/schema.sql` の `posts` テーブルに `accuracy DECIMAL(7,1)`（メートル）列を追加する（`accuracy IS NULL OR accuracy >= 0` の CHECK 付き）。既存環境向けに `ALTER TABLE posts ADD COLUMN IF NOT EXISTS accuracy ...` を併記し、`COMMENT ON COLUMN posts.accuracy` で「水平位置精度（m）。NULL=手動地図選択」を明記する。
- [ ] FR-172-07: 新規 migration（命名規則に従い `supabase/migrations/20260514xxxxxx_add_posts_accuracy.sql`）を追加し、`accuracy` 列追加を冪等（`ADD COLUMN IF NOT EXISTS`）に適用する。
- [ ] FR-172-08: `accuracy` の改竄防止を既存 `is_official` / `weather` 等と同様に整合させる。`supabase/schema.sql:603-662` の `protect_post_status`（UPDATE）と INSERT 保護トリガーで、非 admin / 非 service_role ユーザーの UPDATE 時は `accuracy` を `OLD.accuracy` に固定する（INSERT 時の値はユーザーが自身の測位として登録するため許容）。admin / service_role は素通り。
- [ ] FR-172-09: `src/types/database.types.ts` の `posts` Row/Insert/Update に `accuracy: number | null`（Insert/Update は任意）を追加する。
- [ ] FR-172-10: `useCsvExport.ts` の `select` に `accuracy` を追加し、ヘッダ「位置精度(m)」と「測位手段（GPS/手動）」相当の列を出力する。`accuracy` が NULL の行は手動選択として空欄または「手動」を出力する。

### 非機能要件
- [ ] NFR-172-01: GPS 取得失敗・`accuracy` 未提供（古い端末・権限拒否）でも投稿は従来通り成立する（`accuracy = null` で続行、ブロッキングしない）。
- [ ] NFR-172-02: 精度表示 UI は既存のダーク／ライトテーマ・i18n（`react-i18next`）方針に従い、文言は `src/locales/*/translation.json` に追加する。
- [ ] NFR-172-03: `accuracy` 列追加・トリガー拡張は冪等に再適用でき（`CREATE OR REPLACE` / `ADD COLUMN IF NOT EXISTS` / `DROP TRIGGER IF EXISTS`）、CI（schema 単独適用・rls-tests）を壊さない。
- [ ] NFR-172-04: `enableHighAccuracy: true` による測位タイムアウト延長で投稿フローが体感的に遅延しないよう、既存の `timeout: 5000` を尊重し、タイムアウト時は低精度値または `null` で確定する。

## 受入条件
- [ ] AC-01: GPS が利用可能な端末で投稿フォームを開くと、現在の取得精度（例「±18m」）と良好（緑）／注意（黄）／警告（赤）のいずれかのバッジが表示される。
- [ ] AC-02: 取得精度が 30m 以下のとき緑、31〜50m のとき黄、51m 以上のとき赤で表示される（境界値 30 / 50 を含めて閾値どおり）。
- [ ] AC-03: GPS 取得後に地図をクリックして手動選択すると、表示が「手動選択（精度なし）」に変わり、送信ペイロードの `accuracy` が `null`・`source` が `manual` になる。
- [ ] AC-04: GPS 取得点を送信すると、`posts` 行の `accuracy` に測位値（メートル）が保存される。手動選択点を送信すると `accuracy` が NULL で保存される。
- [ ] AC-05: 認証ユーザーが自分の既存 post を `UPDATE posts SET accuracy = 1` しても、非 admin / 非 service_role では `accuracy` が `OLD.accuracy` のまま変化しない。admin / service_role では更新できる。
- [ ] AC-06: CSV エクスポートに「位置精度(m)」列が含まれ、GPS 投稿は数値、手動選択投稿は空欄（または「手動」）が出力される。
- [ ] AC-07: `accuracy` を提供しない端末（権限拒否含む）でも投稿が成功し、`accuracy` が NULL で保存される（投稿がブロックされない）。
- [ ] AC-08: `supabase/schema.sql` および新規 migration を psql / Supabase SQL Editor で再適用しても重複エラーが出ない（冪等性）。

## 影響範囲
- migration: `supabase/migrations/20260514xxxxxx_add_posts_accuracy.sql`（新規・`accuracy` 列追加 + トリガー拡張）
- schema: `supabase/schema.sql`（`posts` テーブル定義 13-38 / 47-56 に `accuracy` 列、`protect_post_status` 603-662 と INSERT 保護トリガーに `accuracy` 固定）
- 型: `src/types/database.types.ts`（`posts` Row/Insert/Update）、`src/types/index.ts`（`LatLng` または投稿状態・`PostFormData`）
- フォーム: `src/components/features/posts/PostForm.tsx`（`getCurrentPosition` での `accuracy` 取得・state・閾値判定）、`src/components/features/posts/LocationSection.tsx` / `LocationPicker.tsx`（手動選択時の `source/accuracy` 区別と精度バッジ表示）、`src/hooks/usePostForm.ts`（ペイロード・`insert`・`saveOffline`）、`src/lib/constants.ts`（精度閾値定数）、`src/lib/offlineStore.ts`（オフライン保存に `accuracy`）
- エクスポート: `src/hooks/useCsvExport.ts`（`select` 列・ヘッダ・行マッピング）
- i18n: `src/locales/{ja,en,ko,zh}/translation.json`（精度バッジ文言）
- RLS テスト: `supabase/tests/`（`accuracy` の UPDATE 固定を検証するケース追加）

## 優先度
- **緊急度**: Medium
- **重要度**: High
- **理由**: 致命的なバグではないが、位置精度メタの欠落は収集済みデータの SDM 二次利用を恒久的に制約する（後から遡って精度を復元できない）。データ品質バイアス対策として早期にスキーマへ列を確保し、取得を開始する価値が高い。
