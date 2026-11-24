# REQ-174: 定点観察（structured）プロトコルの追加 — 機会記録との並立設計

## 背景
ザリダスは現状、ユーザーが任意の場所・任意のタイミングで投稿する「機会記録（opportunistic / unstructured）」のみを収集している。市民科学による外来種データの解析価値を高めるには、同一地点を反復・定点で調査する「構造化（structured）」プロトコルの並立が必要である。

- **Strayer et al. 2024**: 外来種モニタリングでは、機会記録（unstructured）だけでなく、調査努力量が標準化された定点観察（structured）を並立させる設計を推奨している。両者を区別して保持することで、検出確率の補正・偽陰性（見逃し）の推定・占有モデル（occupancy model）などの統計解析が可能になる。
- **Howard et al. 2022**: 外来種報告アプリのレビューにおいて、「種が見つからなかった」という不在情報（absence / non-detection）の記録機能が多くのアプリで欠落していると指摘している。在情報だけでは分布縮小や防除効果を評価できない。
- **Notion 先行研究レビュー（RQ1 サブテーマ3 + 設計注意点）**: 「定点観察サイト(structured)と機会記録(unstructured)の並立設計」を本アプリの設計指針として挙げている。

ザリダスには既に不在確認の投稿種別 `'absence'`（`src/types/database.types.ts:17`）と調査努力量カラム `survey_duration_minutes`（`supabase/schema.sql:1032`）が存在し、Howard 2022 の指摘する不在記録の素地はある。しかし、それらを「同一の定点サイトで反復された調査ラウンド」として束ねる構造が無いため、Strayer 2024 の言う structured データとしては機能していない。

## 現状の問題
- `src/types/database.types.ts:17,34,49`: `info_type` に `'absence'`（不在確認）はあるが、在/不在の対比を「どの定点サイトの・何回目のラウンドか」として紐づける仕組みが無い。投稿は常に単発の機会記録として扱われる。
- `supabase/schema.sql:1031-1036`: `survey_duration_minutes` は posts に任意カラムとして存在するが、努力量の標準化（同一サイトで同一手法・同一時間帯で反復したか）を担保する枠組みが無く、努力量込みの解析に使えない。
- `supabase/schema.sql:13-73`: `posts` テーブルに調査手法（structured / opportunistic）を区別するフラグが無いため、構造化データと機会記録を分離できない。
- `supabase/schema.sql:1134-1185`: 既存の「調査依頼（survey_requests）」は単発の依頼→結果投稿モデルであり、同一地点を継続的に反復調査する「定点サイト」の概念を持たない（`src/hooks/useSurveyRequests.ts`、`src/app/request/[id]/page.tsx`）。
- `src/hooks/useCsvExport.ts:42,56-73`: CSV エクスポートは posts の列をフラットに出力するのみで、structured / unstructured を区別する列やサイト ID・ラウンド情報が無く、解析者が両者を分離できない。
- `src/components/features/posts/PostForm.tsx:90,388-389`: PostForm は `surveyDurationMinutes` を任意の自由入力として扱うだけで、定点サイトの選択や反復ラウンドとしての記録ができない。

## 目的
定点観察（structured）プロトコルを機会記録（unstructured）と並立で導入する。具体的には、(1) 反復調査の対象となる「調査サイト（survey_sites）」を登録できるようにし、(2) 各投稿が定点サイトの調査ラウンドか機会記録かを示す調査手法フラグ（survey_method）を持たせ、(3) 努力量込みの在/不在を構造化データとして保存し、(4) CSV エクスポート・解析で両者を区別できるようにする。既存の不在確認（`absence`）・努力量（`survey_duration_minutes`）・調査依頼（survey_requests）機能と整合させる。

## 要件

### 機能要件
- [ ] FR-174-01: 定点調査サイト `survey_sites` テーブルを新設し、サイト名・座標（lat/lng）・市区町村・対象種・想定調査手法・任意の説明を登録できるようにする。サイトは作成者（user_id）に紐づく。
- [ ] FR-174-02: `posts` テーブルに調査手法フラグ `survey_method`（`'structured' | 'opportunistic'`、既定 `'opportunistic'`）を追加し、既存投稿はすべて `'opportunistic'`（機会記録）として後方互換に扱う。
- [ ] FR-174-03: `posts` に定点サイト参照 `survey_site_id`（`survey_sites` への FK、`ON DELETE SET NULL`）を追加し、structured 投稿を特定サイトに紐づけられるようにする。
- [ ] FR-174-04: `posts` に調査ラウンド識別子 `survey_round`（INTEGER、任意）を追加し、同一サイトの何回目の反復調査かを記録できるようにする。
- [ ] FR-174-05: structured 投稿では `survey_method='structured'` のとき `survey_site_id` と `survey_duration_minutes`（努力量）を必須とする整合性制約を設ける（在/不在いずれの info_type でも努力量を必須化）。
- [ ] FR-174-06: 在/不在の対比を構造化データとして保存するため、structured ラウンドでは `info_type` に `'sighting'`/`'capture'`/`'trace'`/`'damage'`（在）または `'absence'`（不在）のいずれかを必ず付与し、努力量とサイト・ラウンドと併せて記録する。
- [ ] FR-174-07: PostForm（`src/components/features/posts/PostForm.tsx`）に「定点観察モード」を追加し、登録済みの調査サイトを選択 → ラウンド番号 → 努力量（survey_duration）→ 在/不在を入力して structured 投稿を作成できるようにする。サイト未選択時は従来どおり機会記録として投稿する。
- [ ] FR-174-08: 調査サイトの登録 UI（地図上で地点指定 + サイト名・対象種・手法の入力）を追加する。既存の調査依頼作成 UI（`src/components/modals/SurveyRequestForm.tsx`）のパターンを踏襲する。
- [ ] FR-174-09: 調査サイト一覧/詳細画面で、そのサイトに紐づく structured 投稿（ラウンド履歴・在/不在・努力量）を時系列で確認できるようにする。
- [ ] FR-174-10: CSV エクスポート（`src/hooks/useCsvExport.ts`）に `survey_method`・`survey_site_id`・サイト名・`survey_round`・`survey_duration_minutes` の列を追加し、解析者が structured と unstructured を分離できるようにする。さらにエクスポート時に「定点観察のみ / 機会記録のみ / 全件」を選べるフィルタを追加する。
- [ ] FR-174-11: 既存の「調査依頼（survey_requests）」との連携余地として、調査依頼から定点サイトを生成する（依頼地点を継続観察サイト化する）導線を任意機能として用意する。最小実装ではサイト作成時に元の survey_request_id を任意で紐づけられるようにする。
- [ ] FR-174-12: 集計・解析向けに、サイト単位の在/不在ラウンド数・総努力量を返す RPC または集計ビューを提供する（占有率や検出努力の算出を解析側で行えるようにする）。

### 非機能要件
- [ ] NFR-174-01: 既存の機会記録投稿・既存 CSV エクスポート・既存の調査依頼機能は本変更後も後方互換に動作する（`survey_method` 既定 `'opportunistic'`、新カラムはすべて NULL 許容または既定値あり）。
- [ ] NFR-174-02: `survey_sites` には RLS を設定する（閲覧は公開 SELECT、作成は `auth.uid() = user_id`、更新/削除は所有者のみ）。既存 `survey_requests` の RLS（`supabase/schema.sql:1153-1157`）と同等のポリシー方針に揃える。
- [ ] NFR-174-03: structured / opportunistic の区別やサイト別集計が頻繁に行われるため、`posts(survey_site_id)`・`posts(survey_method)` にインデックスを追加し、サイト詳細・エクスポートのクエリ性能を維持する。
- [ ] NFR-174-04: 追加カラム・新テーブルは `supabase/schema.sql` とマイグレーション、および `src/types/database.types.ts` を同期させる（REQ-003 / REQ-168 のスキーマ同期方針に準拠）。
- [ ] NFR-174-05: 調査サイト作成にはレート制限を設ける（調査依頼の 1 日 3 件制限 `supabase/schema.sql:1159-1179` と同様の濫用防止）。

## 受入条件
- [ ] AC-01: `survey_sites` テーブルが作成され、認証済みユーザーが自分のサイトを作成・更新・削除でき、未認証ユーザーは閲覧のみ可能であることが RLS テストで確認できる。
- [ ] AC-02: PostForm で定点観察モードを選び、登録済みサイト・ラウンド番号・努力量・不在（absence）を入力して投稿すると、`posts` に `survey_method='structured'`・`survey_site_id`・`survey_round`・`survey_duration_minutes` が保存される。
- [ ] AC-03: サイトを選ばずに通常投稿すると `survey_method='opportunistic'` として保存され、`survey_site_id` は NULL になる（既存挙動が維持される）。
- [ ] AC-04: `survey_method='structured'` の投稿で `survey_site_id` または `survey_duration_minutes` が欠落している場合、DB 制約で拒否される。
- [ ] AC-05: CSV エクスポートに `survey_method`・サイト名・`survey_round`・`survey_duration_minutes` 列が含まれ、「定点観察のみ」フィルタを選ぶと structured 投稿だけが出力される。
- [ ] AC-06: 調査サイト詳細画面で、同一サイトの複数ラウンドの在/不在・努力量が時系列で表示される。
- [ ] AC-07: 既存の機会記録投稿・既存 CSV エクスポート・既存の調査依頼が本変更後も従来どおり動作する（回帰なし）。

## 影響範囲

### DB 設計
- 新テーブル `survey_sites`（`supabase/schema.sql` および新規マイグレーション）:
  - `id UUID PK`, `created_at TIMESTAMPTZ`, `user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`
  - `name TEXT NOT NULL`, `lat / lng DECIMAL CHECK`, `municipality TEXT`
  - `species TEXT CHECK (species IN ('american','bullfrog','unknown'))`
  - `survey_method TEXT DEFAULT 'structured'`（サイトの想定手法）
  - `description TEXT`（任意）, `survey_request_id UUID REFERENCES survey_requests(id) ON DELETE SET NULL`（任意・連携用）
  - RLS（公開 SELECT / 所有者 INSERT・UPDATE・DELETE）、インデックス（municipality, species, user_id）、作成レート制限トリガー
- `posts` カラム追加:
  - `survey_method TEXT NOT NULL DEFAULT 'opportunistic' CHECK (survey_method IN ('structured','opportunistic'))`
  - `survey_site_id UUID REFERENCES survey_sites(id) ON DELETE SET NULL`
  - `survey_round INTEGER`
  - 整合性 CHECK 制約: `survey_method='structured'` のとき `survey_site_id IS NOT NULL AND survey_duration_minutes IS NOT NULL`
  - インデックス: `idx_posts_survey_site (survey_site_id) WHERE survey_site_id IS NOT NULL`, `idx_posts_survey_method (survey_method)`
- 集計 RPC/ビュー: サイト別の在/不在ラウンド数・総努力量を返す（FR-174-12）
- 型同期: `src/types/database.types.ts`（posts の新カラム + survey_sites の型を追加）

### フロントエンド
- `src/components/features/posts/PostForm.tsx`: 定点観察モード（サイト選択・ラウンド・努力量・在/不在）
- `src/hooks/usePostForm.ts` / `src/types/index.ts` / `src/lib/offlineStore.ts` / `src/hooks/useOfflineQueue.ts`: 新フィールド（survey_method, survey_site_id, survey_round）の受け渡し
- 新規: 調査サイト登録モーダル（`src/components/modals/SurveyRequestForm.tsx` を参考）・サイト一覧/詳細ページ・`useSurveySites` フック
- `src/hooks/useCsvExport.ts`: 列追加 + structured/unstructured フィルタ
- `src/locales/{ja,en,zh,ko}/translation.json`: 定点観察・調査サイト・調査手法の文言追加

### テスト
- RLS テスト（`supabase/tests/`）: `survey_sites` の所有者制御
- 整合性制約テスト: structured 投稿の必須カラム検証
- スキーマ同期テスト（REQ-003 / REQ-168 準拠）

## 優先度
- **緊急度**: Low
- **重要度**: High
- **理由**: 機会記録のみの現状では Strayer 2024 が推奨する努力量標準化・在/不在対比に基づく解析（占有モデル等）ができず、Howard 2022 が指摘する不在情報の活用も不完全なため、研究データとしての価値向上に直結する重要な機能拡張である。一方で既存の機会記録・調査依頼は機能しており即時の障害ではないため緊急度は低い。新テーブル + 多数の画面・エクスポート改修を伴うため、段階的導入（DB スキーマ → 投稿 → サイト UI → エクスポート/集計）を推奨する。
