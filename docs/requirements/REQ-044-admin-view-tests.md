# REQ-044: 管理画面ビューのテスト整備

## 背景
管理画面（`src/views/admin/`）は、投稿の承認/却下、コメント・ユーザー・通報の管理、ログ閲覧など、サービス運用上クリティカルな操作を担う領域である。誤操作や権限逸脱のリスクが大きいにもかかわらず、現在これらのビューに対する自動テストが存在しない。

## 現状の問題
- `src/views/admin/` 配下にテストが 1 件もない（対象ファイル）：
  - `src/views/admin/AdminPostsPage.tsx`
  - `src/views/admin/AdminCommentsPage.tsx`
  - `src/views/admin/AdminUsersPage.tsx`
  - `src/views/admin/AdminReportsPage.tsx`
  - `src/views/admin/AdminLayout.tsx`
  - `src/views/admin/AdminDashboard.tsx`
  - `src/views/admin/AdminLoginPage.tsx`
  - `src/views/admin/AdminLogsPage.tsx`
- 既存テストは以下 12 ファイルのみで、管理画面は完全に未カバー：
  - `src/hooks/__tests__/useDeletePost.test.js`
  - `src/hooks/__tests__/useEditPost.test.ts`
  - `src/hooks/__tests__/useLike.test.ts`
  - `src/hooks/__tests__/usePostForm.test.js`
  - `src/hooks/__tests__/usePostList.test.ts`
  - `src/hooks/__tests__/useProfile.test.ts`
  - `src/hooks/__tests__/useReverseGeocode.test.js`
  - `src/hooks/__tests__/useWeather.test.ts`
  - `src/views/__tests__/HomePage.test.tsx`
  - `src/views/__tests__/TrendsPage.test.tsx`
  - （他 `src/components/features/**/__tests__/` 配下）
- 承認/却下、バルク削除、非 admin ユーザーのリダイレクトなど、重要フローが一切検証されていない。

## 目的
管理画面の重要操作と権限ガードが仕様どおり動作することを自動テストで保証し、リグレッションを早期検知する。

## 要件
### 機能要件
- [ ] FR-044-01: `AdminLayout` に対し、非 admin ユーザーがアクセスした際にリダイレクト（あるいは拒否表示）されることをテストする。
- [ ] FR-044-02: `AdminPostsPage` の承認/却下ボタン押下時に、Supabase client の `update` が期待する引数（対象 id・`status` 値等）で呼ばれることをテストする。
- [ ] FR-044-03: `AdminPostsPage`（または `AdminCommentsPage`）のバルク選択 → 削除ボタン → 確認ダイアログ確定の一連動作で、`delete`（または相当の API）が選択 id リストで呼ばれることをテストする。
- [ ] FR-044-04: テストは Vitest + `@testing-library/react` を使用。Supabase client は MSW もしくは `vi.mock` によりモック化する。

### 非機能要件
- [ ] NFR-044-01: 追加テストの CI 実行時間は合計 30 秒以内。
- [ ] NFR-044-02: `jsdom` 環境で既存テスト設定（`vitest.config.ts`）と整合し、新規依存を最小化する。

## 受入条件
- [ ] AC-01: `npm test` 実行時、本要件で追加された新規テストが 3 件以上パスする。
- [ ] AC-02: `src/views/admin/` 配下のライン/ブランチカバレッジが 50% 以上。
- [ ] AC-03: 非 admin ユーザーでの `AdminLayout` アクセス時のガードが少なくとも 1 ケース検証されている。

## 影響範囲
- 新規追加: `src/views/admin/__tests__/*.test.tsx`
- モック補助: `src/test/` 配下にヘルパー追加の可能性
- CI: `.github/workflows/` のテストステップ実行時間のみ影響

## 優先度
- **緊急度**: Low
- **重要度**: Medium
- **理由**: 直接的なユーザー影響は無いが、管理画面は運用上クリティカルで、リグレッション時の被害が大きいため中期的に整備すべき。
