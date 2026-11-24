## 目的

1. 状態変更操作（承認/却下/削除/権限変更/通報解決/公式切替）に対して、`SameSite=Lax` に加えて **CSRF トークンの検証** を追加し、多層防御を成立させる。
2. 認証情報の格納方式（Cookie ベースか否か）を実装上で確認し、CSRF の現実的な攻撃面を明確化する。
3. 将来クライアント直叩きから Server Action / Route Handler 経由へ移行する場合でも一貫して効くトークン検証方式を確立する。

## 要件

### 機能要件

- [ ] **FR-150-01: CSRF トークンの発行**
  認証済みセッションに対し、サーバー側で署名付き CSRF トークン（double-submit cookie パターン、または同期トークンパターン）を発行する。トークンは HttpOnly でない Cookie + リクエストヘッダーの組で検証できる形にする。
- [ ] **FR-150-02: 状態変更操作のトークン検証**
  以下の管理操作を **Server Action または Route Handler 経由** に集約し、リクエストごとに CSRF トークンを検証する。検証失敗時は 403 を返し操作を中止する:
  - 投稿の承認 (`approve_post`) / 却下 (`reject_post`)（`AdminPostsPage.tsx:121,142`）
  - 投稿削除 (`delete_post`)（`AdminPostsPage.tsx:202`, `AdminReportsPage.tsx:129`）
  - 公式フラグ切替 (`toggle_official`)（`AdminPostsPage.tsx:309`）
  - コメント削除 (`delete_comment`)（`AdminCommentsPage.tsx:106`）
  - 通報解決 (`resolve_report`)（`AdminReportsPage.tsx:150`）
  - admin 権限付与/剥奪 (`grant_admin` / `revoke_admin`)（`AdminUsersPage.tsx:224`）
- [ ] **FR-150-03: 認証情報格納方式の確認**
  Supabase セッショントークンが Cookie に格納されているか（`src/lib/supabase/middleware.ts` が Cookie へ書いている事実から Cookie ベースの SSR セッション）を確認し、Cookie 経由で自動送信される攻撃面が存在することを前提に CSRF トークン検証を必須化する。
- [ ] **FR-150-04: SameSite 設定の維持**
  `src/lib/supabase/middleware.ts:25-29` の `sameSite: 'lax'` / `secure`（本番）設定は維持し、CSRF トークンと併用する（一次防御 SameSite ＋ 二次防御トークン）。
- [ ] **FR-150-05: トークンの自動付与**
  クライアント側で状態変更リクエストを送る際、CSRF トークンを自動でヘッダーに付与する共通ラッパー（fetch ラッパー / Server Action の hidden field）を用意し、各 admin ページが個別にトークン管理をしないで済むようにする。

### 非機能要件（該当する場合）

- [ ] **NFR-150-01: 互換性**
  トークン検証の追加により、正規の admin 操作が壊れないこと。既存の `writeAuditLog` 記録フロー（操作成功後に呼ばれる）は維持する。
- [ ] **NFR-150-02: トークンの安全性**
  CSRF トークンは予測不能（CSPRNG 由来）で、セッションに紐づき、ログ・URL クエリに出力されないこと。
- [ ] **NFR-150-03: 多層防御の整合**
  RLS（admin role 検証）を最終防御として維持しつつ、CSRF はアプリ層で先に弾く。RLS への新規依存を CSRF 対策の代替にしない。
