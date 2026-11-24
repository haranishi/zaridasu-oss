## テスト種別と環境
- 種別: unit（React hook 単位）
- フレームワーク:
  - Vitest + `@testing-library/react` の `renderHook`, `act`
  - `vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })`
  - `vi.spyOn(window, 'addEventListener')` / `removeEventListener` で呼び出し監視
- モック:
  - `vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))`
  - `vi.mock('@/lib/supabase', () => ({ supabase: { auth: { signOut: vi.fn().mockResolvedValue({}) } } }))`
  - `vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))`
  - `vi.mock('@/context/ToastContext', () => ({ useToastContext: () => ({ info: vi.fn() }) }))`
- 配置先: `src/hooks/__tests__/useAdminSessionTimeout.test.ts`

## テストケース（Given/When/Then）

### TC-01 (INV-01): 30 分無操作で自動サインアウト
- Given:
  ```ts
  vi.useFakeTimers()
  const pushSpy = vi.fn()
  // useRouter → { push: pushSpy }
  const signOutSpy = vi.mocked(supabase.auth.signOut)
  const { result } = renderHook(() => useAdminSessionTimeout(), { wrapper })
  ```
- When: `act(() => vi.advanceTimersByTime(30 * 60 * 1000))`
- Then:
  - `signOutSpy` が 1 回呼ばれる
  - `await vi.runAllTimersAsync()` 後、`pushSpy` が `'/admin/login'` で 1 回呼ばれる

### TC-02 (INV-02): 操作でタイマーリセット
- Given: TC-01 と同じセットアップ
- When:
  1. `vi.advanceTimersByTime(24 * 60 * 1000)` — 24 分経過（warning 前）
  2. `act(() => window.dispatchEvent(new Event('click')))` — リセット発火（`Date.now()` もフェイク進行させ throttle 境界を超えるようにする）
  3. `vi.advanceTimersByTime(29 * 60 * 1000)` — リセット後 29 分（合計 53 分）
- Then: `signOut` はまだ呼ばれていない（`expect(signOutSpy).not.toHaveBeenCalled()`）
- And: さらに `vi.advanceTimersByTime(2 * 60 * 1000)` で合計 55 分（リセット後 31 分）経過させると `signOut` が 1 回呼ばれる

### TC-03 (INV-03): unmount でリスナーと timer が全クリーンアップ
- Given:
  ```ts
  const addSpy = vi.spyOn(window, 'addEventListener')
  const removeSpy = vi.spyOn(window, 'removeEventListener')
  const clearSpy = vi.spyOn(globalThis, 'clearTimeout')
  const { unmount } = renderHook(() => useAdminSessionTimeout(), { wrapper })
  ```
- When: `unmount()`
- Then:
  - `ACTIVITY_EVENTS = ['mousemove','keydown','click','scroll','touchstart']` それぞれに対して `removeSpy` が呼ばれている（5 回 / 各イベント名で検証）
  - `clearSpy` が最低 2 回呼ばれている（warning + timeout）
- And: `vi.advanceTimersByTime(60 * 60 * 1000)`（1 時間）後も `signOut` が呼ばれない（タイマーリーク無し）
