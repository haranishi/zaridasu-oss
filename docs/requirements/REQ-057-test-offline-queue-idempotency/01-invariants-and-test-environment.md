## 守りたい不変条件
- INV-01: 写真 3 枚中 2 枚目の `supabase.storage.from('post-photos').upload(...)` が reject した場合、`sendOne` は `false` を返し、`updatePendingPost(id, { status: 'error', errorMessage })` を呼ぶ（`src/hooks/useOfflineQueue.ts:59-67, 108-112`）
- INV-02: 同一 `PendingPost` に対する 2 回目の `sendOne`（= 1 回目が storage で失敗しリトライ）では、`supabase.from('posts').insert(...)` が合計 1 回しか呼ばれない（1 回目は insert まで到達せず、2 回目で初めて到達する。二重挿入 0 件）
- INV-03: 成功パス（写真 upload 3/3 成功 + insert 成功）で `supabase.functions.invoke('analyze-image', { body: { record: inserted } })` が 1 回だけ呼ばれる（`src/hooks/useOfflineQueue.ts:98-102`）。かつ `deletePendingPost(id)` が 1 回呼ばれる（`:105`）
- INV-04: `insertError` 発生時、`updatePendingPost(id, { status: 'error', errorMessage })` が呼ばれ、少なくとも DB 上の状態として error が記録される（`src/hooks/useOfflineQueue.ts:95, 107-113`）。アップロード済み photoUrls のクリーンアップは現状未実装であり、本テストでは「status='error' に記録される」ことを最低限検証する

## 現状の検出可否
- `src/hooks/__tests__/` 配下に `useOfflineQueue.test.*` が存在しない（Glob 確認済み: `useDeletePost`, `useReverseGeocode`, `usePostForm`, `useEditPost`, `useProfile`, `usePostList`, `useLike`, `useWeather` はあるが `useOfflineQueue` は無い）
- `sendOne` の失敗/成功パスは `useOfflineQueue.ts` 内部の非 exported 関数で、外から差し替え不能
- ゆえに `if (uploadError) throw uploadError` の削除、`insert` の 2 度呼び出し化、`invoke` の複数回呼び出し等のリグレッションが検出できない

## テスト種別と環境
- **種別**: integration（IndexedDB + Supabase モック + React hook）
- **フレームワーク**:
  - Vitest（既存）
  - `fake-indexeddb`（新規 devDependency, S コスト）を `vitest.setup.ts` 冒頭で `import 'fake-indexeddb/auto'`
  - `@testing-library/react` の `renderHook` + `act`
- **セットアップ**:
  - `vi.mock('@/lib/supabase', ...)` で `supabase.storage.from('post-photos').upload`, `supabase.storage.from('post-photos').getPublicUrl`, `supabase.from('posts').insert(...).select(...).single()`, `supabase.functions.invoke` を全て `vi.fn()` でスタブ
  - `vi.mock('@/context/AuthContext', ...)` で `useAuth` が `{ user: { id: 'user-1' } }` を返すようスタブ
  - `vi.mock('@/utils/errorHandler', () => ({ logError: vi.fn() }))`
  - `crypto.randomUUID` は jsdom で利用可能。決定的 UUID が必要なら `vi.spyOn(crypto, 'randomUUID').mockReturnValue('fixed-uuid')`
  - 各テストの `beforeEach` で IndexedDB を `indexedDB.deleteDatabase('zaridasu-offline')` でリセット
  - `addPendingPost` を使って既知の pending post を事前投入
- **配置先**: `src/hooks/__tests__/useOfflineQueue.test.ts`
