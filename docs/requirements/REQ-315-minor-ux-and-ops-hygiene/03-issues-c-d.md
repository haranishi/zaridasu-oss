### 問題C: サインアウトが fire-and-forget で、失敗時に何も起きない — Low

`src/components/layout/Header.tsx:120`

```
onSignOut={() => { signOut(); setDrawerOpen(false) }}
```

`signOut()` は `Promise<void>` を返す（`src/context/AuthContext.tsx:70-72`）が、**await も catch もせずドロワーを即閉じている**。

```
// AuthContext.tsx:70-72
const signOut = useCallback(async () => {
  await supabase.auth.signOut()
}, [])
```

`AuthContext` 側にも catch が無いため、`supabase.auth.signOut()` が失敗（ネットワーク断・トークン失効時のサーバーエラー）すると **unhandled rejection になり、UI には何も表示されない**。ユーザーから見ると「ログアウトを押したらメニューが閉じたが、まだログインしている」という状態になる。

`src/views/admin/AdminLayout.tsx:144-147` は

```
async function handleSignOut() {
  await signOut()
  router.push('/admin/login')
}
```

と await してからリダイレクトしており、**管理画面と一般画面で非対称**である。

### 問題D: 処理中でも背景タップでモーダルを閉じられる — Low

**D-1**: `src/views/DashboardPage.tsx:61-66` のアカウント削除モーダル。背景オーバーレイのボタンに `disabled` が無い。

```
<button
  type="button"
  aria-label={t('common.close')}
  tabIndex={-1}
  className="fixed inset-0 bg-black/50 cursor-default border-0 p-0"
  onClick={onClose}        // ← :66。disabled が無い
/>
```

**同一コンポーネント内のキャンセルボタン（`:103-104`）は `disabled={deleting}` を持っている**。つまり「キャンセルは押せないが背景タップでは閉じられる」という一貫性の欠如が1ファイルの中にある。アカウント削除という**復旧不能な破壊的処理**の進行中にモーダルが消えると、成功したのか失敗したのか（`:98` の `role="alert"` のエラー表示も含めて）結果が一切見えなくなる。

**D-2**: `src/components/modals/EditProfileModal.tsx:120-126` も同様に、背景ボタン（`:124-125`）が `saving` 中も `onClose` を呼べる。保存中に閉じると、`handleSave` の catch（`:100-103`）が出すインラインエラーが見えない。

なお Escape キー（`useEscapeKey(onClose)`。`DashboardPage.tsx:43` 付近 / `EditProfileModal.tsx:81`）も同じく処理中に効く。
