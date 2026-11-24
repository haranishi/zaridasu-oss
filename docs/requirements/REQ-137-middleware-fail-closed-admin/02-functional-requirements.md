## 要件

### 機能要件

- [ ] **FR-137-01: 認証必須ルートの fail-closed**
  `updateSession()` の `try` ブロック先頭で `pathname` を判定し、**catch の挙動を path 別に切り替える**:
  - `/admin/*`（`/admin/login` を除く）→ `NextResponse.redirect('/admin/login?reason=auth_unavailable')` を返す
  - `/dashboard/*` → `NextResponse.redirect('/?reason=auth_unavailable')` を返す
  - それ以外（公開ページ） → 現状通り `NextResponse.next({ request })` で通過（fail-open 維持）
  実装イメージ:
  ```ts
  } catch (err) {
    logError(err as Error, 'middleware:updateSession')
    const pathname = request.nextUrl.pathname
    const isAdminRoute = pathname.startsWith('/admin') && !pathname.startsWith('/admin/login')
    const isDashboardRoute = pathname.startsWith('/dashboard')
    if (isAdminRoute) {
      const url = request.nextUrl.clone()
      url.pathname = '/admin/login'
      url.searchParams.set('reason', 'auth_unavailable')
      return NextResponse.redirect(url)
    }
    if (isDashboardRoute) {
      const url = request.nextUrl.clone()
      url.pathname = '/'
      url.searchParams.set('reason', 'auth_unavailable')
      return NextResponse.redirect(url)
    }
    return NextResponse.next({ request })
  }
  ```

- [ ] **FR-137-02: 例外の Sentry 送信**
  `catch (err)` で `logError(err as Error, 'middleware:updateSession')` を呼び出し、Sentry / errorReporter にエラーを送信する。`src/utils/errorHandler.ts:91` の `logError` を import して利用する。秘匿情報（Cookie 全体・Authorization ヘッダー）は logError 内部のフィルタリングに任せる（既存挙動を踏襲）。

- [ ] **FR-137-03: ログインページ側の理由表示**
  `/admin/login` ページ (`src/app/(admin)/admin/login/page.tsx` または対応する RSC) で `searchParams.reason === 'auth_unavailable'` のとき、上部に inline alert で「認証サービスに一時的にアクセスできません。再度お試しください。」を表示する。`reason` が無い通常導線では何も表示しない（既存挙動を壊さない）。

- [ ] **FR-137-04: Server Component 側の二重防御**
  `/admin/*` 配下の各 Server Component（`page.tsx` / `layout.tsx`）で、middleware の通過を前提とせず**改めて `supabase.auth.getUser()` で `role === 'admin'` を検証**する。既に行っているページはそのまま、行っていないページに追加する。検証失敗時は `redirect('/admin/login')`。
  対象目安: `src/app/(admin)/admin/layout.tsx`（最上位 layout で一度行えば配下に効く）。

- [ ] **FR-137-05: 公開ルートの挙動は変更しない**
  `/`、`/post`、`/posts/[id]` などの公開ルートでは現状通り fail-open を維持する（Supabase 障害時に閲覧機能まで止めない）。`matcher` を変えるのではなく、catch 内で path 判定して挙動を切り替える方式とする。
