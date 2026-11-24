## カバレッジ目標
- `src/hooks/useOfflineQueue.ts:51-115` の `sendOne` 関数における branch カバレッジ ≥ 85%
- line カバレッジ ≥ 90%
- 具体的には: 写真ループの途中失敗分岐、`inserted?.photos?.length` 分岐、catch 分岐の 3 箇所を必ず実行

## テストデータ / フィクスチャ
- Blob ヘルパ: `const mkBlob = (s: string) => new Blob([s], { type: 'image/jpeg' })`
- 正常 formData: `{ lat: 39.72, lng: 140.10, species: 'american', infoType: 'sighting', municipality: '秋田市', comment: 'test', count: 1, observedAt: '2026-04-20', weather: 'sunny', temperature: 20, humidity: 60, surveyDurationMinutes: 10 }`
- supabase fluent chain helper: テストファイル冒頭で
  ```ts
  const insertSingle = vi.fn()
  const storageUpload = vi.fn()
  const getPublicUrl = vi.fn(() => ({ data: { publicUrl: 'https://cdn/u.jpg' } }))
  const invoke = vi.fn().mockResolvedValue({ data: null, error: null })
  vi.mock('@/lib/supabase', () => ({
    supabase: {
      storage: { from: () => ({ upload: storageUpload, getPublicUrl }) },
      from: () => ({ insert: () => ({ select: () => ({ single: insertSingle }) }) }),
      functions: { invoke },
    },
  }))
  ```

## 受入条件
- [ ] AC-01: `npm test -- src/hooks/__tests__/useOfflineQueue.test.ts` で 4 ケース通過
- [ ] AC-02: ネガティブ検証 — `src/hooks/useOfflineQueue.ts:64` の `if (uploadError) throw uploadError` を削除すると TC-01 が失敗（status='error' にならない）。`src/hooks/useOfflineQueue.ts:100` の `.catch(() => {})` を消して `invoke` を 2 回呼ぶように書き換えると TC-03 が失敗。`src/hooks/useOfflineQueue.ts:95` の `if (insertError) throw insertError` を削除すると TC-04 で `deletePendingPost` が呼ばれてしまい失敗
- [ ] AC-03: CI で 3 回連続成功（fake-indexeddb は deterministic だが、テスト間で DB リセットを `afterEach` で必ず行う）

## 影響範囲
- 新規 devDependency: `fake-indexeddb`
- 新規: `src/hooks/__tests__/useOfflineQueue.test.ts`
- 既存変更: 必要に応じて `vitest.setup.ts` に `import 'fake-indexeddb/auto'` を追加（他フック（`usePostForm` 等）にも波及する場合はテスト専用の setup ファイルを分離することも可）
- 参照のみ: `src/hooks/useOfflineQueue.ts`, `src/lib/offlineStore.ts`, `src/lib/supabase.ts`

## 優先度
- **緊急度**: High
- **重要度**: High
- **理由**: オフライン投稿機能はネットワーク不安定地域でのコアユースケースで、重複挿入が起きると「同じ報告が 2 件」「保留キューが空にならない」といったデータ汚染・UX 破綻に直結する。hook 本体のテストが 0 件の状態は、今後のリファクタリング（例: REQ 022 系の storage 強化）で容易に退行を招く。
