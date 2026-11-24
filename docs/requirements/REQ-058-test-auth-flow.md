# REQ-058: 認証コールバック / 管理ログインのフローテスト

## 背景
ユーザー向けの OAuth / メール確認フロー (`src/views/AuthCallbackPage.tsx`) と、管理画面ログイン (`src/views/admin/AdminLoginPage.tsx`) は、アプリケーション全体のセキュリティと UX の要でありながら、現状テストが 0 件である。

- `AuthCallbackPage.tsx:44-85`: `supabase.auth.onAuthStateChange` のハンドラが `SIGNED_IN` / `INITIAL_SESSION` / `PASSWORD_RECOVERY` を分岐し、`router.replace('/dashboard')` や `router.replace('/')` にリダイレクトする。`INITIAL_SESSION` で session が無ければ `mode='error'` に遷移してエラー UI を描画する (`AuthCallbackPage.tsx:78-80`)。
- `AdminLoginPage.tsx:92-112`: `signInWithPassword` が失敗すると `recordFailedAttempt` と `t('admin.login.error')` を表示、成功時は `router.refresh()` → `router.push('/admin')`。
- リグレッションが起きると白画面化・無限ローディング・管理画面の権限昇格失敗など致命的障害につながる。

## 守りたい不変条件
- INV-01: OAuth callback で URL に `type` パラメータが無い場合（OAuth リダイレクト）、`onAuthStateChange` の `SIGNED_IN` または `INITIAL_SESSION` イベントで `window.dataLayer.push` と `router.replace('/')` が呼ばれる（= Supabase セッション処理が Subscribe されていること）
- INV-02: `SIGNED_IN` で session が存在し `type=signup` のとき、`mode='confirmed'` に遷移し、3 秒後に `/dashboard` に遷移する（`setTimeout` が登録される）
- INV-03: `INITIAL_SESSION` で session が null のとき `mode='error'` に遷移し、`認証に失敗しました` 見出しとエラーメッセージが DOM に描画される（白画面にならない）
- INV-04: `AdminLoginPage` でパスワード誤り時、`signInWithPassword` が `{ error }` を返すと `t('admin.login.error')` 相当のエラーメッセージが表示され、`router.push` は呼ばれない
- INV-05: `AdminLoginPage` でログイン成功時、`router.refresh()` → `router.push('/admin')` の順で呼ばれ、ログイン試行カウントが `sessionStorage` から削除される（`clearAttempts`）

## 現状の検出可否
- `src/views/__tests__/AuthCallbackPage.test.tsx`: 存在しない
- `src/views/admin/__tests__/AdminLoginPage.test.tsx`: 存在しない
- 既存テストで INV-01〜05 を保証しているものは無く、`onAuthStateChange` の `await` を削ったり `router.push('/admin')` を落としても CI は通る（= 検出不能）

## テスト種別と環境
- 種別: unit（コンポーネント / ハンドラ単位）
- フレームワーク: Vitest + `@testing-library/react` + `@testing-library/user-event`
- モック:
  - `vi.mock('@/lib/supabase', ...)` で `supabase.auth.onAuthStateChange` / `signInWithPassword` / `updateUser` をスタブ
  - `vi.mock('next/navigation', ...)` で `useRouter` → `{ replace, push, refresh }` を vi.fn()
  - `vi.mock('@/context/ThemeContext', ...)` で `useTheme` → `{ dark: false }`
  - `vi.mock('react-i18next', ...)` で `useTranslation` → `{ t: (k) => k }`
  - `vi.useFakeTimers()` を INV-02 の `setTimeout(..., 3000)` 検証で利用
- 配置先:
  - `src/views/__tests__/AuthCallbackPage.test.tsx`
  - `src/views/admin/__tests__/AdminLoginPage.test.tsx`

## テストケース（Given/When/Then）

### TC-01 (INV-01): OAuth コールバックで subscription が張られる
- Given: `window.location.search = ''`, `window.location.hash = ''`、`onAuthStateChange` のモックが `subscription.unsubscribe` を持つオブジェクトを返す
- When: `render(<AuthCallbackPage />)`
- Then:
  - `supabase.auth.onAuthStateChange` が 1 回呼ばれる
  - モックのコールバックを `('SIGNED_IN', { user: { created_at: new Date().toISOString() } })` で手動発火すると、`router.replace` が `'/'` で呼ばれる
  - `window.dataLayer.push` が `{ event: 'sign_up' | 'login', method: 'google' }` の形で呼ばれる

### TC-02 (INV-02): signup 確認メール経由で /dashboard に遷移
- Given: `window.location.search = '?type=signup'`、`vi.useFakeTimers()`
- When: `render(<AuthCallbackPage />)` 後、onAuthStateChange コールバックを `('SIGNED_IN', { user: { created_at: new Date().toISOString() } })` で呼ぶ
- Then:
  - `window.dataLayer.push` が `{ event: 'sign_up', method: 'email' }` で呼ばれる
  - DOM に `メールアドレスの確認が完了しました！` が表示される
  - `vi.advanceTimersByTime(3000)` 後、`router.replace('/dashboard')` が 1 回呼ばれる

### TC-03 (INV-03): INITIAL_SESSION で session が無いとエラー UI
- Given: `window.location.search = ''`, `window.location.hash = ''`
- When: onAuthStateChange コールバックを `('INITIAL_SESSION', null)` で発火
- Then:
  - DOM に `認証に失敗しました` が出現（白画面ではない）
  - `認証リンクが無効か期限切れです。再度メールアドレスの登録をお試しください。` が表示される
  - `router.replace` は呼ばれない

### TC-04 (INV-04): 管理ログインの不正パスワードでエラー表示
- Given: `signInWithPassword` が `{ error: { message: 'Invalid login credentials' } }` を返す
- When: `render(<AdminLoginPage />)` → email / password を入力して submit
- Then:
  - `t('admin.login.error')` に対応する文字列（モックでは `'admin.login.error'`）が DOM 内に存在
  - `router.push` が呼ばれていない
  - `sessionStorage.getItem('admin_login_attempts')` に `{ count: 1, lockedAt: null }` が保存されている

### TC-05 (INV-05): 管理ログイン成功で /admin にリダイレクト
- Given: `signInWithPassword` が `{ error: null }` を返す、事前に `sessionStorage.setItem('admin_login_attempts', JSON.stringify({count:2,lockedAt:null}))`
- When: submit を実行
- Then:
  - `router.refresh` → `router.push('/admin')` の順で呼ばれる（`mock.invocationCallOrder` で検証）
  - `sessionStorage.getItem('admin_login_attempts')` が `null`（クリアされている）

## カバレッジ目標
- `src/views/AuthCallbackPage.tsx`: branch 80% / line 85%
- `src/views/admin/AdminLoginPage.tsx`: branch 85% / line 90%

## テストデータ / フィクスチャ
- session fixture: `{ user: { id: 'u1', created_at: '2026-04-21T00:00:00Z' } }`
- onAuthStateChange モック: コールバックを `let storedCb; mockImpl.mockImplementation((cb) => { storedCb = cb; return { data: { subscription: { unsubscribe: vi.fn() } } } })` でキャプチャし、各テスト内で手動発火
- `window.dataLayer = []` を `beforeEach` で初期化

## 受入条件
- [ ] AC-01: `npm test -- src/views/__tests__/AuthCallbackPage.test.tsx src/views/admin/__tests__/AdminLoginPage.test.tsx` が全ケース通過
- [ ] AC-02: ネガティブ検証 — `AuthCallbackPage.tsx` の `router.replace('/dashboard')` をコメントアウトすると TC-02 が失敗 / `AdminLoginPage.tsx` の `router.push('/admin')` を外すと TC-05 が失敗 / `onAuthStateChange` ハンドリングを削ると TC-01/TC-03 が失敗
- [ ] AC-03: GitHub Actions CI (`.github/workflows/ci.yml`) の `npm test` ジョブで 3 回連続成功

## 影響範囲
- `src/views/AuthCallbackPage.tsx`
- `src/views/admin/AdminLoginPage.tsx`
- 新規テストファイル 2 本のみ。本体コードへの影響なし

## 優先度
Medium（セキュリティ面で重要だが、既存手動テストでフォール可能なため P1 ではない）
