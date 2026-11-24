## カバレッジ目標
- `src/hooks/useAdminSessionTimeout.ts`: branch 90% / line 95% / function 100%
- INV-01〜03 の 3 ケースで主要分岐を網羅

## テストデータ / フィクスチャ
- fake timer 設定:
  ```ts
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })
  ```
- `wrapper`: ToastContext/I18n プロバイダが必要であれば最小構成の `({ children }) => <>{children}</>` で十分（モック経由で供給）

## 受入条件
- [ ] AC-01: `npm test -- src/hooks/__tests__/useAdminSessionTimeout.test.ts` が全ケース通過
- [ ] AC-02: ネガティブ検証 —
  - `useAdminSessionTimeout.ts:69-75` の cleanup ブロックをコメントアウト（`removeEventListener` と `clearTimeout` を削除）すると TC-03 が失敗
  - `useAdminSessionTimeout.ts:60` のスロットル条件 `> 60_000` を `< 60_000` に反転すると TC-02 が失敗（タイマーが永久にリセットされなくなり予想タイミングで signOut 発火）
  - `TIMEOUT_MS` を `60 * 60 * 1000`（1 時間）に書き換えると TC-01 が失敗
- [ ] AC-03: GitHub Actions CI の `npm test` ジョブで 3 回連続成功

## 影響範囲
- `src/hooks/useAdminSessionTimeout.ts`
- 新規テスト 1 本（`src/hooks/__tests__/useAdminSessionTimeout.test.ts`）
- 本体コードへの変更なし

## 優先度
Medium（セキュリティ機能だが、手動確認でも代替可能。長期メンテのため自動化必要）
