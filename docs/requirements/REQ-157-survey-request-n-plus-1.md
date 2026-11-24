# REQ-157: 調査依頼詳細の取得が N+1（survey_requests → user_profiles → posts の逐次クエリ）

## 背景
調査依頼の詳細画面は `src/hooks/useSurveyRequests.ts` 内の `useSurveyRequest(id)` フックで、単一の調査依頼とその投稿者プロフィール・関連投稿を取得している。`survey_requests` は `user_profiles` への直接の外部キーを持たないため、プロフィールは別クエリで取得する構成になっている。

## 現状の問題
`useSurveyRequest` の `fetchRequest`（`useSurveyRequests.ts:154-208`）が、1件の調査依頼詳細を表示するために **3 本のクエリを逐次（直列）実行**しており、典型的な N+1（親→子を別ラウンドトリップで取得）になっている。

1. 調査依頼本体（`useSurveyRequests.ts:164-169`）
   ```ts
   supabase.from('survey_requests')
     .select('id, user_id, lat, lng, municipality, species, reason, urgency, status, created_at, closed_at, response_count')
     .eq('id', id).single()
   ```
2. 投稿者プロフィール（`:176-185`） — 1 の結果 `record.user_id` を待ってから実行
   ```ts
   // user_profiles を別途取得（直接の外部キーがないため）
   supabase.from('user_profiles')
     .select('display_name, avatar_emoji')
     .eq('id', record.user_id).single()
   ```
3. 関連投稿（`:189-197`） — `survey_request_id` で紐付け
   ```ts
   supabase.from('posts')
     .select('id, created_at, species, info_type, municipality, comment, photos, user_id, lat, lng')
     .eq('survey_request_id', id).eq('status', 'approved')
     .order('created_at', { ascending: false }).limit(10)
   ```

問題点:
- クエリ2は `await q1.single()`（`:169`）の結果を待ってから実行されるため、1→2 が直列ラウンドトリップになる。クエリ3も同一 `await` フロー内で逐次実行され、合計で最大3往復のレイテンシが積み上がる。
- 各クエリに `abortSignal` を分散して付与しており（`:168`, `:181`, `:196`）、ラウンドトリップごとに `signal?.aborted` チェック（`:170`, `:183`, `:198`）が必要になっている。
- `survey_requests` と `user_profiles` の間に外部キーがない（`:175` のコメント）ことが分離取得の理由になっているが、これは PostgREST の embed 設定または集約 RPC で1往復化できる。

## 目的
調査依頼詳細の取得を、可能な限り1往復のクエリに統合し、レイテンシと往復回数を削減する。`survey_requests`・`user_profiles`・関連 `posts` を、PostgREST の embed（リレーション定義）もしくは集約 RPC で一括取得する。

## 要件
### 機能要件
- [ ] FR-157-01: `survey_requests` → `user_profiles`（`display_name, avatar_emoji`）の取得を、PostgREST embed もしくは RPC により本体クエリと同一ラウンドトリップに統合する。外部キーが無いことが embed の障壁である場合は、`survey_requests.user_id → user_profiles.id` のリレーションを DB 側で定義（FK もしくは PostgREST が解決できる関係付け）するか、集約 RPC を採用する。
- [ ] FR-157-02: 関連投稿（`survey_request_id = id` かつ `status = 'approved'`、`created_at` 降順 10 件、`useSurveyRequests.ts:189-197`）を、同一 RPC または embed で一括取得し、別ラウンドトリップを廃止する。embed の場合は子リレーションの `order`/`limit`/`status` フィルタを維持する。
- [ ] FR-157-03: 取得結果を従来どおり `request`（`user_profiles` を含む `SurveyRequest`）と `relatedPosts`（`RelatedPost[]`）に分解して state にセットする（`:186`, `:199`）。返り値の型・形状は変更しない。
- [ ] FR-157-04: 既存の `AbortController`/`abortSignal` 連携（`:154`, `:168`, `:181`, `:196`, `:210-214`）と、`id` 未定義時の早期 return（`:155-159`）、`refetch` の `useCallback` 安定化（`:217-219`）を維持する。統合後は signal 付与・aborted チェックを1往復分に集約できる。
- [ ] FR-157-05: 統合後も RLS が真の防衛線として機能すること（`survey_requests`／`user_profiles`／`posts` 各テーブルの参照可否が現状と一致）。embed/RPC が RLS をバイパスしないことを確認する。

### 非機能要件（該当する場合）
- [ ] NFR-157-01: 調査依頼詳細の取得ラウンドトリップ数が 3 → 1（または最小）に削減され、ネットワークレイテンシ依存の表示遅延が改善すること。
- [ ] NFR-157-02: 取得列は現状の絞り込み（必要列のみ・REQ-103 方針）を維持し、PII を含む列を新たに増やさないこと。

## 受入条件
- [ ] AC-01: 調査依頼詳細画面で、依頼本体・投稿者の表示名/アバター絵文字・関連投稿（承認済み最大10件）が現状と同じ内容で表示される。
- [ ] AC-02: ネットワークタブで、詳細表示時の Supabase へのリクエストが3往復から1往復（または最小回数）に削減されていることを確認できる。
- [ ] AC-03: `id` 未定義時・取得失敗時・アンマウント時（abort）の挙動が現状（`loading` 解除、`request=null` フォールバック、無限ループ防止）と一致する。
- [ ] AC-04: 他ユーザーが参照できないプロフィール/投稿が、統合クエリ経由でも漏洩しない（RLS 整合）。
- [ ] AC-05: `next build` および型チェックがエラーなく完了する。

## 影響範囲
- `src/hooks/useSurveyRequests.ts`（`useSurveyRequest.fetchRequest`、`:154-208`）
- Supabase 側 DB（`survey_requests.user_id ↔ user_profiles.id` のリレーション定義、または新規集約 RPC・権限設定）
- 調査依頼詳細を表示する画面（`useSurveyRequest` を利用するビュー）
- `src/types/post.ts`（`RelatedPost`）・`SurveyRequest` 型（形状維持の確認のみ）

## 優先度
- **緊急度**: 中 / **重要度**: 中 / **理由**: 機能は正常に動作しているがレイテンシの逐次積み上げがあり、詳細表示の体感速度に影響する。embed もしくは RPC への統合で確実に往復数を削減でき、REQ-113（詳細画面の embed 化）で確立した手法を横展開できる。
