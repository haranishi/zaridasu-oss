## 受入条件
- [ ] AC-01: 実験 `ai_feedback` を `rollout_percentage=50` で定義すると、同一ユーザーは何度アクセスしても常に同じ群（control または treatment）に割り当てられる。
- [ ] AC-02: `rollout_percentage` を 20→50 に引き上げると、既に treatment だったユーザーは control に戻らず（単調性）、新たに約30%ぶんが treatment に加わる。
- [ ] AC-03: treatment 群のユーザーの投稿には、その投稿が treatment 群で行われたことを示す割付情報が `posts` に記録される。
- [ ] AC-04: 投稿に位置取得方法（EXIF GPS / 手動 / Geolocation）が保存され、`get_experiment_metrics` が群別の位置精度を返す。
- [ ] AC-05: `get_experiment_metrics(p_experiment_key, p_from, p_to)` が control/treatment それぞれについて、投稿数・写真添付率・リピート投稿率・位置精度を独立に返す。
- [ ] AC-06: 同 RPC が pre/post × control/treatment の4セルの値と各セルの n を返し、ダッシュボード側で DID 推定量を算出できる。
- [ ] AC-07: 管理ダッシュボードの実験ビューで control と treatment の4指標が並列表示され、各指標の群間差分と信頼区間（またはDID）が表示される。CI が0をまたぐケースでは「有意でない可能性」が視覚的に示される。
- [ ] AC-08: 研究用エクスポート（CSV/RPC）は集計値のみを含み、user_id 原文・生の緯度経度・写真URL を含まない。実行は管理者に限定され `audit_logs` に記録される。
- [ ] AC-09: 一部指標の集計クエリが失敗しても、ダッシュボードの他指標は表示され続ける（部分失敗許容）。
- [ ] AC-10: 実験が未定義またはフラグ取得失敗時、UI は control（介入OFF）にフォールバックし、投稿機能は通常どおり動作する。
- [ ] AC-11: 追加した実験テーブル/割付列/RPC が `supabase/migrations/` のマイグレーションと `supabase/schema.sql`・`src/types/database.types.ts` で一致している。

## 影響範囲
- **DB（新規テーブル/列）**:
  - `experiments`（実験定義: key / enabled / rollout_percentage / variants / seed / started_at / ended_at）
  - `experiment_assignments` または `user_profiles` への割付列（ユーザー × 実験 × variant）
  - `posts` への割付記録列（例 `experiment_assignments` JSONB）と位置精度メタデータ列（取得方法 / accuracy）
  - `supabase/migrations/` に新規マイグレーション追加、`supabase/schema.sql` と同期
- **RPC**:
  - 安定割付の評価（サーバー側）/ `get_experiment_metrics(p_experiment_key, p_from, p_to)`（群×期間の4指標 + pre/post セル + 統計量）/ 研究用エクスポート用 RPC
  - 既存 `get_admin_post_stats`（`supabase/migrations/20260513000011_get_admin_post_stats.sql`）の集計パターンを踏襲
- **フラグ機構**:
  - 割付ハッシュ関数（クライアント/サーバー共通）、`useExperiment` / `useFeatureFlag` フック
  - SSR/RSC でのフラグ評価（`src/app/layout.tsx` の計測経路と整合）
  - REQ-170（AIフィードバックON/OFF）・REQ-171（ランキング新旧）の出し分け接続点
- **ダッシュボード**:
  - `src/app/admin` 配下に実験計測ビュー追加
  - `src/hooks/useAdminStats.ts` のパターンに倣う新フック / `src/components/features/dashboard/KPISection.tsx` に倣う群比較・効果量・CI 表示コンポーネント
- **計測**:
  - `src/hooks/usePostForm.ts`（位置取得方法/精度の保存）、必要に応じて `src/components/common/WebVitalsReporter.tsx` 経路と整合
- **型**:
  - `src/types/database.types.ts`（新テーブル/列/RPC の型追加）
- **権限/監査**:
  - RLS ポリシー追加、`audit_logs` へのフラグ変更・エクスポート記録

## 優先度
- **緊急度**: High
- **重要度**: High
- **理由**: 本基盤は卒業研究の核である仮説 H2（介入の有意な向上を効果量・信頼区間で報告）を準実験デザイン（DID/段階ロールアウト）で実証するための土台であり、REQ-170〜174 の介入効果を季節効果と分離して測定する唯一の手段である。これが無ければ各介入の評価が交絡により無効化されるため、最重要要件として優先する。
