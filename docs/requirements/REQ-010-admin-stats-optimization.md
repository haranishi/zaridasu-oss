# REQ-010: useAdminStats クライアントサイド集計の最適化

## 背景
管理ダッシュボードの統計データを取得する `useAdminStats` フックは、集計処理をクライアント側の JavaScript で行っている。投稿数が増加するにつれてデータ転送量・メモリ使用量・処理時間が線形に増大し、パフォーマンスとスケーラビリティの問題を引き起こす。

## 現状の問題
- `src/hooks/useAdminStats.ts` (173 行)
- **全投稿データのクライアント取得** (L99): `filteredPosts('species, info_type, municipality')` で期間内の全投稿レコードをダウンロードし、`allPosts` としてクライアントに保持
- **種別カウントのクライアント集計** (L112-114): `allPosts` を JavaScript の `forEach` でループして `speciesCounts` を算出
- **情報種別カウントのクライアント集計** (L117-119): 同様に `infoTypeCounts` を `forEach` で算出
- **月別集計のクライアント処理** (L122-134): `monthlyData` (全レコードの `created_at` を取得) を `filter` で月ごとにカウント
- **市町村ランキングのクライアント集計** (L137-145): `allPosts` の `municipality` を `forEach` でカウントし、ソート
- 合計 **8 並列クエリ** (L85-107) を `Promise.all` で実行しているが、うち 2 つ (`allPosts`, `monthlyData`) は全レコードフェッチ
- `monthlyData` (L100) は `filteredPosts('created_at').order(...)` で全レコードの `created_at` を取得しており、`allPosts` と重複するデータ取得

## 目的
集計処理を Supabase の Database Function (RPC) または PostgreSQL View に移行し、クライアントへのデータ転送を最小化してパフォーマンスとスケーラビリティを確保する。

## 要件

### 機能要件
- [ ] FR-010-01: 種別ごとの投稿数集計を DB サイド RPC `get_species_counts(from_date, to_date)` で実行するよう変更する
- [ ] FR-010-02: 情報種別ごとの投稿数集計を DB サイド RPC `get_info_type_counts(from_date, to_date)` で実行するよう変更する
- [ ] FR-010-03: 月別投稿数集計を DB サイド RPC `get_monthly_counts(from_date, to_date)` で実行するよう変更する
- [ ] FR-010-04: 市町村ランキングを DB サイド RPC `get_municipality_ranking(from_date, to_date, limit)` で実行するよう変更する
- [ ] FR-010-05: 上記 RPC を統合した単一 RPC `get_admin_stats(from_date, to_date)` の採用も検討する（ネットワークラウンドトリップ削減）
- [ ] FR-010-06: `allPosts` および `monthlyData` の全件フェッチ（L99-100）を廃止し、RPC 結果に置き換える
- [ ] FR-010-07: 既存の `range` (日付範囲) フィルタ機能は維持する

### 非機能要件
- [ ] NFR-010-01: RPC のレスポンスサイズは投稿数に依存せず一定のサイズ（集計結果のみ）であること
- [ ] NFR-010-02: Supabase マイグレーションファイルに RPC 定義を含め、`supabase/migrations/` に配置すること
- [ ] NFR-010-03: 1000 投稿以上でもダッシュボード表示が 2 秒以内であること
- [ ] NFR-010-04: AbortController によるキャンセル機能は維持すること（既存 L57-58 の仕組み）

## 受入条件
- [ ] AC-01: `useAdminStats.ts` で全投稿データをクライアントにダウンロードする処理が存在しないこと
- [ ] AC-02: 種別カウント・情報種別カウント・月別推移・市町村ランキングが DB サイドで算出されていること
- [ ] AC-03: 管理ダッシュボードに表示される統計情報が従来と同一であること
- [ ] AC-04: 日付範囲フィルタ変更時に統計が正しく再取得されること
- [ ] AC-05: Supabase マイグレーションファイルが追加されていること

## 影響範囲
- `src/hooks/useAdminStats.ts` (修正)
- `supabase/migrations/YYYYMMDD_admin_stats_rpc.sql` (新規)
- `src/views/admin/AdminDashboard.tsx` (型変更がある場合)

## 優先度
- **緊急度**: Medium
- **重要度**: High
- **理由**: 現状は投稿数が少ないため問題が顕在化していないが、投稿数が増加するとダッシュボードの表示速度が劣化し、不要なデータ転送によるコスト増・メモリ圧迫が発生する。スケーラビリティの根本的な問題であり早期対応が望ましい。
