## 背景
管理画面の承認/却下/削除/権限付与などの操作は、`src/lib/auditLog.ts` の `writeAuditLog` を通して `audit_logs` テーブルに追跡ログを残す（REQ-020）。しかし現状の `AdminPostsPage.test.tsx` (REQ-044) は `vi.mock('@/lib/auditLog', () => ({ writeAuditLog: vi.fn() }))` で呼び出しをモックしているだけで、**call args の内容を検証していない**ため、以下のようなリグレッションが検出されない：

- `action` 文字列を間違える（例: `'approve_post'` → `'approve'`）
- `details` を空オブジェクトで渡す（操作の復元情報が失われる）
- `targetId` を取り違える（別投稿のログが残る）
- `rejection_reason` を details に含め忘れる（GDPR/監査観点で致命的）

呼び出し元：
- `src/views/admin/AdminPostsPage.tsx:120-126` approve_post
- `src/views/admin/AdminPostsPage.tsx:143-149` reject_post
- `src/views/admin/AdminPostsPage.tsx:172-178` delete_post (bulk)
- `src/views/admin/AdminPostsPage.tsx:203-209` approve_post (bulk)
- `src/views/admin/AdminPostsPage.tsx:277-283` toggle_official
- `src/views/admin/AdminPostsPage.tsx:300-306` delete_post (single)
- `src/views/admin/AdminCommentsPage.tsx:107-117` delete_comment
- `src/views/admin/AdminUsersPage.tsx:232-238` grant_admin / revoke_admin
- `src/views/admin/AdminReportsPage.tsx:130-136` delete_post (from report)
- `src/views/admin/AdminReportsPage.tsx:153-159` resolve_report

## 守りたい不変条件
- INV-01: `handleApprove` 実行時、`writeAuditLog` が `{ adminId: 'admin-id', action: 'approve_post', targetType: 'post', targetId: <post.id>, details: { municipality, species, info_type } }` の **完全一致** で呼ばれる
- INV-02: `handleReject` 実行時、`action === 'reject_post'` かつ `details.rejection_reason === <入力した reason>` が含まれる
- INV-03: `handleDelete` 実行時、`action === 'delete_post'` かつ `targetId === deleteTarget.id`
- INV-04: `handleToggleOfficial` 実行時、`action === 'toggle_official'` かつ `details.is_official === !post.is_official`（= 変更後の新値）

## 現状の検出可否
- `src/views/admin/__tests__/AdminPostsPage.test.tsx` (REQ-044) は approve 時の `updateFn`/`updateEq` 呼び出しは検証するが、`writeAuditLog` の call args はチェックしていない（line 100-114）
- `AdminCommentsPage` / `AdminUsersPage` / `AdminReportsPage` 用のテストは 0 件
- したがって `writeAuditLog({ adminId, action: 'approve_post', ..., details: {} })` に書き換えても CI は通る
