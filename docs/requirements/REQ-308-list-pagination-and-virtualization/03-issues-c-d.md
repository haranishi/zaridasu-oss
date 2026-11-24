### 問題C: AdminReportsPage が limit なしで reports 全件＋投稿 embed を取得 — Medium

`src/views/admin/AdminReportsPage.tsx:103-107`:

```ts
const { data, error } = await supabase
  .from('reports')
  .select(`*, posts(id, species, info_type, municipality, comment, photos, created_at)`)
  .eq('resolved', tab === 'resolved')
  .order('created_at', { ascending: false })
```

- **`.limit()` / `.range()` が無く、ページング UI も無い。**
- **`select('*')`** なので `reporter_ip` を含む reports の全列が返る（`:113-116` の `ipCountMap` が `reporter_ip` を使うため完全な削除はできないが、**必要列の明示化で露出面は縮小できる**）。
- とくに「**対応済み**」タブ（`tab === 'resolved'`）は**運用と共に単調増加**するため、時間経過に比例して劣化する。各通報に紐づく posts 行も一括で返るため転送量は件数の倍以上に効く。

他の管理画面がすべてページング済みである（背景の表を参照）ことを踏まえると、これは**方針からの単純な取り残し**である。

### 問題D: get_admin_user_list() が全ユーザー無制限返却、2 画面で重複取得、DOM に 2 重描画 — Medium

`supabase/schema.sql:715-736` の RPC 定義本体（`:733-734`）:

```sql
    FROM auth.users u ORDER BY u.created_at DESC;
```

**LIMIT / OFFSET パラメータが存在しない**（引数は 0 個）。クライアント側にもページングが無い。

1. `AdminUsersPage.tsx:221`（`supabase.rpc('get_admin_user_list')`）が**全ユーザーを取得**する。
2. `AdminUsersPage.tsx:312`（モバイル向けカード表示 `md:hidden`）と `:386`（PC 向けテーブル `<tbody>`）の **2 箇所で `users.map` を回す**ため、**全ユーザー行が DOM に 2 セット存在**する（CSS で片方を隠しているだけ）。
3. `AdminLogsPage.tsx:70` が、**監査ログの `user_id` → email 引き当てのためだけに同じ全件 RPC を叩く**（`useEffect` で無条件、`.then` で `setAdminList`）。ログ本体は `:78-79` で `p_limit: ADMIN_PAGE_SIZE` / `p_offset` とページング済みなのに、**名前解決だけが全件取得**という不整合。

`auth.users` の行は削除されないため単調増加し、**線形に劣化する**。RPC は `SECURITY DEFINER` ＋ JWT の `app_metadata.role = 'admin'` チェック（`:725-727`）で保護されているので権限面の問題はない。純粋に取得量と描画量の問題。
