# REQ-009: AdminPostsPage コンポーネント分割

## 背景
管理画面の投稿管理ページ `AdminPostsPage.tsx` は 877 行に膨大化しており、インラインサブコンポーネント・ビジネスロジック・UI が単一ファイルに混在している。コードの可読性・保守性・テスト容易性が著しく低下している。

## 現状の問題
- `src/views/admin/AdminPostsPage.tsx` が **877 行**の単一ファイル
- ファイル内にインラインで定義されたサブコンポーネント:
  - `MapModalInner` (L26-53): lazy ロードされた地図モーダル
  - `MapModalContent` (L55-61): Suspense ラッパー
  - `DeleteDialog` (L81-101): 削除確認ダイアログ
  - `RejectDialog` (L109-165): 却下ダイアログ（理由選択・メッセージ入力を含む）
- メインコンポーネント `AdminPostsPage` (L174-877) に以下が混在:
  - 20 個以上の useState (L178-197)
  - Supabase クエリ構築・実行ロジック (`fetchPosts` L207-228, `fetchPendingCount` L199-205)
  - 一括操作ロジック (`handleBulkDelete` L298-330, `handleBulkApprove` L332-362)
  - CSV エクスポート処理 (`handleExportCSV` L364-413)
  - 個別操作ハンドラ (`handleApprove` L255-273, `handleReject` L275-296, `handleDelete` L430-458, `handleToggleOfficial` L415-428)
  - フィルタ UI・タブ切替・ページネーション・テーブル表示すべてが JSX に直接記述
- `REJECTION_REASONS` 定数 (L65-72) がファイルローカルに定義されている

## 目的
AdminPostsPage を適切な粒度のコンポーネント・カスタムフック・ユーティリティに分割し、単一責任原則に沿った保守可能なコードベースにする。

## 要件

### 機能要件
- [ ] FR-009-01: `DeleteDialog` を `src/components/features/admin/DeleteDialog.tsx` に抽出する
- [ ] FR-009-02: `RejectDialog` を `src/components/features/admin/RejectDialog.tsx` に抽出する（`REJECTION_REASONS` 定数も移動）
- [ ] FR-009-03: `MapModalContent` / `MapModalInner` を `src/components/features/admin/MapModal.tsx` に抽出する
- [ ] FR-009-04: 投稿フェッチ・一括操作・個別操作ロジックを `src/hooks/useAdminPosts.ts` カスタムフックに抽出する（`fetchPosts`, `fetchPendingCount`, `handleApprove`, `handleReject`, `handleDelete`, `handleBulkDelete`, `handleBulkApprove`, `handleToggleOfficial` を含む）
- [ ] FR-009-05: CSV エクスポート処理を `src/hooks/useCsvExport.ts` または既存の同名フックに統合する
- [ ] FR-009-06: フィルタ UI 部分を `src/components/features/admin/PostFilters.tsx` に抽出する
- [ ] FR-009-07: ページネーション部分を汎用コンポーネント `src/components/ui/Pagination.tsx` に抽出する
- [ ] FR-009-08: 分割後の `AdminPostsPage.tsx` は **300 行以下** にする

### 非機能要件
- [ ] NFR-009-01: 分割前後で既存の機能・動作が変わらないこと（リグレッションなし）
- [ ] NFR-009-02: 抽出したコンポーネント・フックにそれぞれ Props / 戻り値の型定義を付与すること
- [ ] NFR-009-03: 抽出したカスタムフック `useAdminPosts` にユニットテストを追加すること

## 受入条件
- [ ] AC-01: `AdminPostsPage.tsx` が 300 行以下になっている
- [ ] AC-02: `DeleteDialog`, `RejectDialog`, `MapModal`, `PostFilters` が独立ファイルとして存在する
- [ ] AC-03: `useAdminPosts` カスタムフックが投稿管理ロジックをカプセル化している
- [ ] AC-04: 管理画面の投稿一覧ページで、承認・却下・削除・一括操作・CSV エクスポート・フィルタ・ページネーションが従来通り動作する
- [ ] AC-05: TypeScript の型エラーが発生しないこと
- [ ] AC-06: 既存テストが全てパスすること

## 影響範囲
- `src/views/admin/AdminPostsPage.tsx` (分割元)
- `src/components/features/admin/DeleteDialog.tsx` (新規)
- `src/components/features/admin/RejectDialog.tsx` (新規)
- `src/components/features/admin/MapModal.tsx` (新規)
- `src/components/features/admin/PostFilters.tsx` (新規)
- `src/components/ui/Pagination.tsx` (新規)
- `src/hooks/useAdminPosts.ts` (新規)

## 優先度
- **緊急度**: Medium
- **重要度**: High
- **理由**: 現状 877 行のファイルは新機能追加やバグ修正の障壁になっており、テスト追加も困難。管理画面の今後の改善速度に直結するため重要度は高いが、ユーザー影響はないため緊急度は中程度。
