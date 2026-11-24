## テスト種別と環境
- 種別: unit（コンポーネント × モック 1 本化）
- フレームワーク: Vitest + `@testing-library/react` + `@testing-library/user-event`
- 既存モック戦略を踏襲:
  - `vi.mock('@/lib/auditLog', () => ({ writeAuditLog: vi.fn() }))` を共通化
  - `beforeEach` で `vi.mocked(writeAuditLog).mockClear()`
- 配置先:
  - 既存ファイル `src/views/admin/__tests__/AdminPostsPage.test.tsx` を拡張（approve/reject/delete/toggle_official 4 ケース追加）
  - 新規ファイル `src/views/admin/__tests__/AdminCommentsPage.test.tsx`（delete_comment）— 任意。Phase 2
  - 新規ファイル `src/views/admin/__tests__/AdminReportsPage.test.tsx`（resolve_report）— 任意。Phase 2

## テストケース（Given/When/Then）

### TC-01 (INV-01): approve_post で details に species/info_type/municipality が入る
- Given: モックの posts データ = `{ id: 'p1', species: 'american', info_type: 'sighting', municipality: '秋田市', status: 'pending', ... }`、`vi.mocked(writeAuditLog)` を参照
- When: `user.click(screen.getByTestId('approve-p1'))` → `waitFor(() => expect(updateFn).toHaveBeenCalled())`
- Then:
  ```ts
  expect(writeAuditLog).toHaveBeenCalledWith({
    adminId: 'admin-id',
    action: 'approve_post',
    targetType: 'post',
    targetId: 'p1',
    details: { municipality: '秋田市', species: 'american', info_type: 'sighting' },
  })
  ```
  完全一致 (`toHaveBeenCalledWith`) で検証

### TC-02 (INV-02): reject_post で details.rejection_reason が保存される
- Given: `RejectDialog` のモックを `onConfirm({ reason: 'duplicate', message: 'すでに投稿済み' })` を呼ぶボタンに差し替え
- When: 却下ダイアログを開いて確定
- Then:
  ```ts
  expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
    action: 'reject_post',
    targetType: 'post',
    targetId: 'p1',
    details: expect.objectContaining({ rejection_reason: 'duplicate', species: 'american', municipality: '秋田市' }),
  }))
  ```

### TC-03 (INV-03): delete_post（単体）で audit log が書かれる
- Given: `DeletePostDialog` のモックを onConfirm ボタンに差し替え、`supabase.from('posts').delete().eq` が `{ error: null }` を返す
- When: 削除確定
- Then: `writeAuditLog` が `action: 'delete_post', targetType: 'post', targetId: 'p1'` を含む引数で呼ばれる
- And: `error` のケース（`.delete().eq` が `{ error: Error }` を返す）では `writeAuditLog` が呼ばれない（ネガティブ検証込み）

### TC-04 (INV-04): toggle_official で details.is_official が新値
- Given: posts データ `is_official: false` を含む、statusTab='approved' で表示
- When: 「公式にする」ボタンをクリック
- Then:
  ```ts
  expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
    action: 'toggle_official',
    details: expect.objectContaining({ is_official: true, species: 'american', municipality: '秋田市' }),
  }))
  ```
- And: 同じ投稿をもう一度クリックすると `details.is_official: false` で呼ばれる
