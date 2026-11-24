# REQ-104: useStats を `get_dashboard_stats` RPC に切り替え

> 親 REQ: REQ-092
> 関連 REQ: REQ-032（data-fetching-optimization）— DB 側は実装済、フロント未配線

## 背景
REQ-032 で DB 側の集約 RPC `get_dashboard_stats` が `supabase/migrations/002_dashboard_stats_rpc.sql` に既に実装されている。**しかしフロントエンドの `src/hooks/useStats.ts` は依然として 6〜7 個の並列クエリ + クライアント側集計**のまま。

「ガワだけ作って配線忘れ」状態であり、現存する DB 最適化の効果が出ていない。

## 現状の問題
- `supabase/migrations/002_dashboard_stats_rpc.sql` で関数 `get_dashboard_stats` 定義済（DB 側完成）
- `src/hooks/useStats.ts:120-133` で `Promise.all` を 6〜7 並列実行（前 REQ-032 の指摘）
- ダッシュボード初期表示時に大量の小さな round-trip + クライアント集計
- データ転送量とクライアント計算量が改善されていない

## 目的
既存の RPC を呼ぶ実装に切り替え、ダッシュボードの初回表示を体感 50%+ 高速化する（REQ-032 の効果を実現）。

## 要件

### 機能要件
- [ ] FR-104-01: `src/hooks/useStats.ts` を改修し、6〜7 並列クエリを 1〜2 個の `supabase.rpc('get_dashboard_stats', { p_user_id: userId ?? null })` 呼び出しに置換
- [ ] FR-104-02: RPC レスポンスの型を `src/types/database.types.ts` または専用の `src/types/dashboardStats.ts` に定義
- [ ] FR-104-03: クライアント側で行っていた集計処理（種類別 / 月別 / 市町村別）を全て削除
- [ ] FR-104-04: RPC が失敗した場合は ErrorBoundary で受ける（手動 fallback は不要）
- [ ] FR-104-05: 既存の `useStats` の戻り値 shape を維持（呼び出し側の DashboardPage / TrendsPage 等を変えずに済むようにする）

### 非機能要件
- [ ] NFR-104-01: ダッシュボード初期表示時の Supabase 通信回数が 1〜2 件に減ること
- [ ] NFR-104-02: 全件 2000 行 fetch + クライアント集計が消えること
- [ ] NFR-104-03: 既存テスト（vitest）が pass すること
- [ ] NFR-104-04: RPC は `SECURITY INVOKER` で動作し RLS を尊重すること（DB 側で既に保証）

## 受入条件
- [ ] AC-01: `src/hooks/useStats.ts` 内に `Promise.all` の並列クエリパターンが残っていない
- [ ] AC-02: ダッシュボードの DevTools Network タブで Supabase リクエストが 1〜2 件
- [ ] AC-03: ダッシュボードの統計値が現状と一致（投稿総数 / 種類別カウント / 市町村ランキング等）
- [ ] AC-04: `npm test` で既存テストが pass
- [ ] AC-05: TrendsPage（月別グラフ）の表示も回帰しない
- [ ] AC-06: web-vitals（REQ-097）でダッシュボードの LCP / TTFB が改善（任意）

## 影響範囲
- `src/hooks/useStats.ts`（改修）
- `src/views/DashboardPage.tsx`（戻り値が同じなら変更不要）
- `src/views/TrendsPage.tsx`（同上）
- `src/views/admin/AdminDashboard.tsx`（同上）
- `src/types/database.types.ts` または新規 `src/types/dashboardStats.ts`
- `supabase/migrations/002_dashboard_stats_rpc.sql`（無変更、確認のみ）

## 優先度
- **緊急度**: High
- **重要度**: High
- **理由**: DB 側の作業が完了しているのにフロントが配線されていない無駄。半日で完了可能（S）。即効性あり。

## 実装メモ
- まず `supabase/migrations/002_dashboard_stats_rpc.sql` を読んで、戻り値の `jsonb` 構造を正確に把握する
- ローカルで `supabase functions serve` 不要。`supabase.rpc` は通常の PostgREST 経由
- 型定義例：
  ```ts
  type DashboardStats = {
    total_posts: number
    this_month: number
    last_month: number
    by_species: Array<{ species: string; count: number }>
    by_info_type: Array<{ info_type: string; count: number }>
    monthly: Array<{ ym: string; count: number }>
    by_municipality: Array<{ municipality: string; count: number }>
  }
  ```
- 呼び出し側の `useEffect` 依存配列を整理し、無限ループ防止（REQ-090 と同様の罠に注意）
