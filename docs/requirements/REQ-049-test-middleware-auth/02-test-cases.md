## テストケース（Given/When/Then）

### TC-01: 未認証で /admin/posts は /admin/login へリダイレクト
- **Given**: `getUser` を `{ data: { user: null }, error: null }` を返す mock に設定。`req = new NextRequest(new URL('http://localhost/admin/posts'))`
- **When**: `const res = await updateSession(req)`
- **Then**:
  - `res.status === 307`
  - `res.headers.get('location') === 'http://localhost/admin/login'`
  - `getSession` は呼ばれていない（INV-01、`middleware.ts:41` は `getUser` を使う）

### TC-02: 非 admin ユーザーで /admin/posts は / へリダイレクト
- **Given**: `getUser` を `{ data: { user: { id: 'u1', app_metadata: { role: 'user' } } }, error: null }` を返す mock。URL は `/admin/posts`
- **When**: `const res = await updateSession(req)`
- **Then**:
  - `res.status === 307`
  - `res.headers.get('location') === 'http://localhost/'`（INV-02）

### TC-03: admin で /admin/posts は next() を通過する
- **Given**: `getUser` を `{ data: { user: { id: 'a1', app_metadata: { role: 'admin' } } }, error: null }` に設定。URL は `/admin/posts`
- **When**: `const res = await updateSession(req)`
- **Then**:
  - `res.status === 200`（`NextResponse.next()` のデフォルト）
  - `res.headers.get('location') === null`（INV-03）
  - `getUser` が 1 回だけ呼ばれている

### TC-04: /admin/login は認証チェックをスキップ
- **Given**: `getUser` を `{ data: { user: null } }` に設定。URL は `/admin/login`
- **When**: `const res = await updateSession(req)`
- **Then**:
  - `res.status === 200`（リダイレクトしない）
  - `getUser` / `getSession` とも呼ばれていない（INV-04、`middleware.ts:35-37` の条件分岐）

### TC-05: 未認証で /dashboard は / へリダイレクト（REQ-035 回帰ガード）
- **Given**: `getUser` を `{ data: { user: null }, error: null }` に設定。URL は `/dashboard`
- **When**: `const res = await updateSession(req)`
- **Then**:
  - `res.status === 307`
  - `res.headers.get('location') === 'http://localhost/'`
  - `getUser` が呼ばれている（`getSession` ではない、INV-05）

### TC-06: getUser が throw した場合は next() でリクエストを通す
- **Given**: `getUser` を `vi.fn().mockRejectedValue(new Error('network down'))` に設定。URL は `/admin/posts`
- **When**: `const res = await updateSession(req)`
- **Then**:
  - `res.status === 200`（500 にならない、INV-06）
  - `res.headers.get('location') === null`
  - テスト側で `expect(updateSession(req)).resolves.toBeDefined()`（reject しない）
