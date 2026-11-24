## 背景

ザリダスの管理操作（投稿の承認/却下、投稿・コメントの削除、公式フラグの切替、通報の解決、admin 権限の付与/剥奪）は、すべてブラウザ上の Supabase JS クライアントから **Supabase セッションを認証情報として** 実行される。認証情報は Cookie に保存されており、現状の CSRF 対策は **Cookie の `SameSite=Lax` 設定のみ** に依存している。CSRF トークンによる明示的な検証は行われていない。

`SameSite=Lax` は多くのクロスサイト POST を防ぐが、トップレベルナビゲーション由来の GET 系や一部のリクエスト形態を完全には塞がず、Defense in Depth の観点ではアプリ層のトークン検証を併用することが望ましい。

## 現状の問題

（ファイルパス:行番号と現コードの実態）

- `src/lib/supabase/middleware.ts:22-30` — Cookie 書き込み時に以下を強制している:
  ```ts
  const isProduction = process.env.NODE_ENV === 'production'
  cookiesToSet.forEach(({ name, value, options }) =>
    // REQ-019E: Enforce SameSite=Lax and Secure for CSRF protection
    supabaseResponse.cookies.set(name, value, {
      ...options,
      sameSite: 'lax',
      secure: isProduction,
    } as never)
  )
  ```
  `src/lib/supabase/middleware.ts:24` のコメント `// REQ-019E: Enforce SameSite=Lax and Secure for CSRF protection` が示す通り、**CSRF 防御は SameSite=Lax のみ**。CSRF トークンの発行・検証は一切無い。
- 状態変更操作は Server Action / Route Handler を経由せず、クライアントから直接 Supabase に書き込んでいる。具体的には:
  - `src/views/admin/AdminPostsPage.tsx:121,142` — `supabase.from('posts').update(...)`（承認/却下のステータス変更）
  - `src/views/admin/AdminPostsPage.tsx:202` — `supabase.from('posts').delete().eq('id', post.id)`（投稿削除）
  - `src/views/admin/AdminPostsPage.tsx:309` — `supabase.from('posts').update({ is_official: newValue })`（公式フラグ切替）
  - `src/views/admin/AdminCommentsPage.tsx:106` — `supabase.from('comments').delete().eq('id', deleteTarget.id)`（コメント削除）
  - `src/views/admin/AdminReportsPage.tsx:129` — `supabase.from('posts').delete().eq('id', report.post_id)`（通報経由の投稿削除）
  - `src/views/admin/AdminReportsPage.tsx:150` — `supabase.from('reports').update({ resolved: true })`（通報解決）
  - `src/views/admin/AdminUsersPage.tsx:224-226` — `supabase.rpc('set_user_admin_role', { grant_admin: ... })`（admin 権限の付与/剥奪）
- これらはすべて Supabase セッション Cookie で認証され、リクエストごとの CSRF トークン検証は無い。

### 緩和要因（既存の防御）

- Supabase JS クライアントは認証情報を `Authorization: Bearer <JWT>` ヘッダーでも送る構成が一般的であり、純粋な「Cookie 自動送信のみで成立する」古典的 CSRF が直接成立するかはトークン格納方式（Cookie か localStorage か）に依存する。本要件はこの前提を実装で確認したうえで、Defense in Depth として CSRF トークンを追加するもの。
- `SameSite=Lax`（`src/lib/supabase/middleware.ts:27`）により、サードパーティサイトからの自動 POST は概ねブロックされる。
