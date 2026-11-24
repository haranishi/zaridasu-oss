## 背景
`src/hooks/useAdminSessionTimeout.ts`（REQ-018C）は、管理画面にログインしたユーザーが 30 分無操作だと自動ログアウトするセキュリティ機能。25 分で警告トースト、30 分で `supabase.auth.signOut()` → `router.push('/admin/login')` を実行する。

- 実装ポイント:
  - `useAdminSessionTimeout.ts:9-11`: `TIMEOUT_MS = 30 * 60 * 1000`, `WARNING_MS = 25 * 60 * 1000`, `ACTIVITY_EVENTS = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart']`
  - `useAdminSessionTimeout.ts:27-30`: `handleSignOut` で `supabase.auth.signOut()` → `router.push('/admin/login')`
  - `useAdminSessionTimeout.ts:44-52`: `resetTimers` で `setTimeout` を 2 本登録（warning / timeout）
  - `useAdminSessionTimeout.ts:58-63`: `onActivity` は 60 秒スロットル（`Date.now() - lastActivityRef.current > 60_000`）
  - `useAdminSessionTimeout.ts:69-75`: `useEffect` cleanup で 5 個のイベントリスナー全解除 + 2 本の timeout をクリア

- テスト 0 件: `grep -r useAdminSessionTimeout src/**/*.test.*` で 0 hit（現状）
- リグレッションリスク: cleanup 削除 → メモリリーク、throttle 反転 → 毎秒タイマーリセットで timeout が永久に発火せず管理画面が入りっぱなしになる

## 守りたい不変条件
- INV-01: マウント後 30 分（`TIMEOUT_MS`）経過し、その間 activity イベントが 1 回も発火しなければ、`supabase.auth.signOut` が 1 回呼ばれ、直後に `router.push('/admin/login')` が呼ばれる
- INV-02: 25 分時点では `supabase.auth.signOut` が呼ばれず、ユーザー操作（`window.dispatchEvent(new Event('click'))` など）でタイマーがリセットされ、その後 30 分経過後に signOut が呼ばれる（= タイマーがリセットされている証拠）
- INV-03: コンポーネント unmount 時に:
  - `ACTIVITY_EVENTS` の 5 種すべての `removeEventListener` が呼ばれる
  - 2 本の `clearTimeout` が呼ばれる（warning + timeout）
  - その後に fake timer で 30 分進めても `signOut` が呼ばれない（リーク無し）

## 現状の検出可否
- `src/hooks/__tests__/` 以下に `useAdminSessionTimeout.test.*` は存在しない
- Cleanup を削除した状態でも実行時には即座には気付かない（メモリ監視ツールが無い限り）
- Throttle を `> 60_000` → `< 60_000` に反転しても unit テストが無いため CI は通る
