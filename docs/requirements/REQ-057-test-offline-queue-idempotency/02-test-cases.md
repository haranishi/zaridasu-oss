## テストケース（Given/When/Then）

### TC-01: 写真 2 枚目 upload 失敗で status='error'（INV-01）
- **Given**:
  - `addPendingPost(formData, [blob1, blob2, blob3])` で pending post を 1 件作成
  - `storage.upload` を `mockResolvedValueOnce({ data: { path: 'p1' }, error: null })` → `mockResolvedValueOnce({ data: null, error: new Error('upload failed: quota exceeded') })` → `mockResolvedValueOnce({ data: { path: 'p3' }, error: null })` の順で設定
- **When**: `renderHook(() => useOfflineQueue())` の `sendAll` を await で実行
- **Then**:
  - `storage.upload` 呼び出し回数 === 2（3 回目には到達しない）
  - `supabase.from('posts').insert` 呼び出し回数 === 0
  - 当該 pending post の最終 status が `'error'` で、`errorMessage` に `'upload failed'` が含まれる（IndexedDB を `getPendingPosts()` で読み取り確認）

### TC-02: リトライ時の冪等性 — insert は合計 1 回（INV-02）
- **Given**:
  - 1 回目の試行で TC-01 と同じ失敗シナリオを実行し、pending post が status='error' で残る
  - 2 回目の試行では `storage.upload` を 3 回とも成功させる mock に差し替え、`insert().select().single()` を `{ data: { id: 99, photos: ['u1','u2','u3'], species: 'american' }, error: null }` で成功させる
- **When**: `sendAll` をもう 1 回実行
- **Then**:
  - 2 回目の `storage.upload` 呼び出し回数 === 3（写真は最初から再アップロード）
  - 全体を通じて `supabase.from('posts').insert` 呼び出し回数 === 1（1 回目では insert まで到達しなかったため）
  - `deletePendingPost` が呼ばれ、IndexedDB から当該 post が消える
  - `getPendingCount()` === 0

### TC-03: 成功時に analyze-image が 1 回だけ invoke される（INV-03）
- **Given**:
  - `addPendingPost` で 1 件作成、`storage.upload` 全 3 回成功、`insert().select().single()` 成功（photos: 3 件）
- **When**: `sendAll` を await
- **Then**:
  - `supabase.functions.invoke` 呼び出し回数 === 1
  - 引数が `('analyze-image', { body: { record: { id: 99, photos: [...], species: 'american' } } })`
  - `deletePendingPost` 呼び出し回数 === 1
  - `sendOne` 内部で true が返る（`getPendingCount() === 0` で間接確認）
- **補助**: `inserted.photos` が空 `[]` の場合、`invoke` が呼ばれないことも別ケースで確認（`:98` の `if (inserted?.photos?.length)` 分岐）

### TC-04: insertError 発生時に status='error' に記録される（INV-04）
- **Given**:
  - 写真 3 枚 upload は全て成功（mock）
  - `insert().select().single()` が `{ data: null, error: new Error('row violates check constraint') }` を返す
- **When**: `sendAll`
- **Then**:
  - `supabase.from('posts').insert` 呼び出し回数 === 1
  - `supabase.functions.invoke` 呼び出し回数 === 0（analyze-image まで進まない）
  - `deletePendingPost` 呼び出し回数 === 0（削除されない）
  - IndexedDB 上の当該 post の status が `'error'`、`errorMessage` に `'check constraint'` が含まれる
  - `logError` が `'offlineQueue:sendOne'` context で呼ばれる
