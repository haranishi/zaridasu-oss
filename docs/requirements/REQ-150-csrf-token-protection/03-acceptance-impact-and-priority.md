## 受入条件

- [ ] **AC-150-01**: **Given** 有効な admin セッション Cookie を持つブラウザ、**When** 外部サイトに仕込まれた自動フォーム/スクリプトが「投稿削除」相当のリクエストを発火、**Then** CSRF トークンが欠落/不一致のため 403 で拒否され、投稿は削除されない。
- [ ] **AC-150-02**: **Given** 正規の admin 画面、**When** 管理者が UI から投稿を削除、**Then** 正しい CSRF トークンが付与され操作が成功し、`audit_logs` に `delete_post` が記録される。
- [ ] **AC-150-03**: **Given** admin 権限付与操作（`set_user_admin_role`）、**When** CSRF トークン無しで実行、**Then** 403 で拒否され、`grant_admin` は記録されない。
- [ ] **AC-150-04**: **Given** トークン検証導入後、**When** 通報解決・公式切替・コメント削除・承認/却下を UI から実行、**Then** いずれも正しいトークン付きで成功する（regression なし）。
- [ ] **AC-150-05**: **Given** `src/lib/supabase/middleware.ts`、**When** Cookie が書き込まれる、**Then** `sameSite='lax'` と（本番）`secure=true` が維持されている。

## 影響範囲

（変更対象ファイル一覧、他機能への影響）

| ファイル | 変更内容 |
|---|---|
| `src/lib/supabase/middleware.ts` | CSRF トークン Cookie の発行（既存 SameSite 設定は維持） |
| 新規: CSRF トークン検証ユーティリティ / Route Handler / Server Actions | トークン発行・検証ロジック |
| `src/views/admin/AdminPostsPage.tsx` | 承認/却下/削除/公式切替を検証付き経路に変更 |
| `src/views/admin/AdminCommentsPage.tsx` | コメント削除を検証付き経路に変更 |
| `src/views/admin/AdminReportsPage.tsx` | 投稿削除・通報解決を検証付き経路に変更 |
| `src/views/admin/AdminUsersPage.tsx` | `set_user_admin_role` 呼び出しを検証付き経路に変更 |
| 新規: クライアント fetch ラッパー | トークン自動付与 |

### 他機能への影響

- **REQ-019E（SameSite Cookie 強制）**: 本要件は REQ-019E の SameSite 一次防御に CSRF トークンを上積みする延長。
- **`audit_logs` / `writeAuditLog`（`src/lib/auditLog.ts`）**: 操作成功後の記録フローは維持。検証で弾かれた操作は記録されない（正しい挙動）。
- **RLS（admin role）**: 最終防御として維持。CSRF はその手前で弾く多層防御。
- **一般ユーザーの状態変更操作**: コメント投稿・通報送信など一般ユーザーの状態変更操作も同じ攻撃面を持つため、対象に含めるか別 REQ で扱うかを設計時に判断する（本 REQ の主対象は admin 操作）。

## 優先度

- **緊急度**: Medium（`SameSite=Lax` が一次防御として効いており、かつ Supabase セッションのトークン格納方式次第で古典的 CSRF が成立しない可能性がある。実態確認が前提）
- **重要度**: High（admin 権限付与・投稿削除など、成功時の被害が大きい操作が CSRF トークン無しで実行されている。Defense in Depth として必須級）
- **理由**: `SameSite=Lax` のみに依存した CSRF 対策は、ブラウザ実装差・トップレベルナビゲーション・将来の SameSite 仕様変更に対して脆い。管理操作は被害が大きいため、トークン検証による二重防御が望ましい。一方で SameSite が現に効いていること、Supabase の認証ヘッダー方式次第で攻撃面が限定される可能性があることから、緊急度は Medium とする。
