# REQ-020: 監査ログの整合性保証（DB側トリガー化）

## 背景
管理者操作の監査ログは `src/lib/auditLog.ts` でクライアントサイドからfire-and-forget方式で書き込まれている。ログ挿入が失敗しても管理操作は成功するため、監査証跡が欠落するリスクがある。また、クライアント側からの挿入はログの改ざん・省略が可能。

## 現状の問題
- `src/lib/auditLog.ts:16-27`: `writeAuditLog()` がfire-and-forget。エラー時は `logError()` でログするだけで操作をブロックしない
- 監査ログの書き込みと管理操作がアトミック（トランザクション）になっていない
- クライアント側コードのため、開発者ツールやネットワーク遮断でログ書き込みをバイパス可能
- `src/views/admin/AdminUsersPage.tsx:232`: ロール変更後にクライアント側で `writeAuditLog` を呼び出し

## 目的
監査ログの書き込みをDB側トリガーに移行し、管理操作と監査ログの同時記録を保証する。

## 要件

### 機能要件
- [ ] FR-020-01: 管理者操作（投稿削除・承認・却下、コメント削除、レポート処理、ロール変更）に対するDB側AFTERトリガーを作成し、`audit_logs` テーブルに自動記録する
- [ ] FR-020-02: `audit_logs` テーブルのINSERTのみ許可し、UPDATE/DELETEを禁止するRLSポリシーを設定する（append-only）
- [ ] FR-020-03: 既存の `writeAuditLog()` クライアント呼び出しを削除し、DB側トリガーに完全移行する
- [ ] FR-020-04: トリガーは `SECURITY DEFINER` で実行し、呼び出し元の権限に依存しないようにする

### 非機能要件
- [ ] NFR-020-01: トリガーの実行が管理操作のレイテンシーに与える影響を5ms以内に抑える
- [ ] NFR-020-02: 監査ログのスキーマにタイムスタンプ、操作者ID、操作種別、対象ID、変更前後の値を含める

## 受入条件
- [ ] AC-01: 管理者が投稿を削除すると、クライアント側コードなしで `audit_logs` にレコードが作成される
- [ ] AC-02: `audit_logs` テーブルの既存レコードをDELETE/UPDATEしようとするとエラーになる
- [ ] AC-03: `src/lib/auditLog.ts` の `writeAuditLog()` が呼び出されていないこと（grep で確認）
- [ ] AC-04: 管理画面のログ一覧ページで新しいトリガーベースのログが正しく表示される

## 影響範囲
- `supabase/schema.sql`（トリガー・RLSポリシー追加）
- `src/lib/auditLog.ts`（削除またはラッパーのみに変更）
- `src/views/admin/AdminPostsPage.tsx`
- `src/views/admin/AdminUsersPage.tsx`
- `src/views/admin/AdminCommentsPage.tsx`
- `src/views/admin/AdminReportsPage.tsx`

## 優先度
- **緊急度**: High
- **重要度**: High
- **理由**: 監査ログの欠落は不正操作の検知を困難にし、インシデント対応を遅延させる
