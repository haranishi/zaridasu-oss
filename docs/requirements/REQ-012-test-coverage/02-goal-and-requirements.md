## 目的
重要度の高いモジュールから優先的にテストを追加し、コアロジックのリグレッション検知能力を確保する。

## 要件

### 機能要件

#### Phase 1: Critical（最優先）
- [ ] FR-012-01: `useOfflineQueue.ts` のテスト追加 — キュー追加・リトライ・オンライン復帰時の同期処理をテスト
- [ ] FR-012-02: `offlineStore.ts` のテスト追加 — IndexedDB への CRUD 操作をテスト（fake-indexeddb 使用）
- [ ] FR-012-03: `imageProcessor.ts` のテスト追加 — リサイズ・圧縮・EXIF 削除・エラーハンドリングをテスト
- [ ] FR-012-04: `useAdminStats.ts` のテスト追加 — 日付範囲フィルタ・集計ロジック・AbortController をテスト

#### Phase 2: High
- [ ] FR-012-05: `useLike.ts` のテスト追加 — いいね追加・取消・楽観的更新・エラー時のロールバックをテスト
- [ ] FR-012-06: `rpcThrottle.ts` のテスト追加 — スロットリング・キューイング・タイムアウトをテスト
- [ ] FR-012-07: `auditLog.ts` のテスト追加 — ログ書き込み・フォーマット・エラー時の挙動をテスト
- [ ] FR-012-08: `AdminPostsPage.tsx` の統合テスト追加 — 投稿一覧表示・フィルタ・承認/却下/削除の操作フローをテスト
- [ ] FR-012-09: `AdminDashboard.tsx` の統合テスト追加 — 統計表示・日付範囲切替をテスト

#### Phase 3: Medium
- [ ] FR-012-10: `useFocusTrap.ts` のテスト追加
- [ ] FR-012-11: `usePostDraft.ts` のテスト追加
- [ ] FR-012-12: `useSurveyRequests.ts` のテスト追加
- [ ] FR-012-13: `geocodeCache.ts` のテスト追加
- [ ] FR-012-14: `municipalityLabel.ts` のテスト追加

### 非機能要件
- [ ] NFR-012-01: テストは Jest + React Testing Library で記述すること（既存テストと統一）
- [ ] NFR-012-02: Supabase クエリは `jest.mock` でモック化し、外部依存なしで実行可能にすること
- [ ] NFR-012-03: Phase 1 完了後、hooks のテストカバレッジが 50% 以上であること
- [ ] NFR-012-04: Phase 2 完了後、lib のテストカバレッジが 30% 以上であること
- [ ] NFR-012-05: CI パイプラインでテストが自動実行されること

