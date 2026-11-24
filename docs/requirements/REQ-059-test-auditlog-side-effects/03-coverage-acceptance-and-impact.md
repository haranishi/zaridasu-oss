## カバレッジ目標
- `src/views/admin/AdminPostsPage.tsx` の `writeAuditLog` 呼び出し 6 箇所中、最低 4 箇所（approve / reject / delete / toggle_official）を厳密検証
- Phase 2 で `AdminCommentsPage`, `AdminReportsPage`, `AdminUsersPage` を追加し、`writeAuditLog` 呼び出し箇所の 100% を網羅

## テストデータ / フィクスチャ
- `rangeFn.mockResolvedValue` に既存フィクスチャを流用（`id: 'p1', species: 'american', info_type: 'sighting', municipality: '秋田市'`）
- `is_official` テスト用に別フィクスチャ `{ ...p1, status: 'approved', is_official: false }` を用意
- `writeAuditLog` モックは既存 `vi.mock('@/lib/auditLog')` を再利用し、`import { writeAuditLog } from '@/lib/auditLog'` + `vi.mocked(writeAuditLog)` で参照

## 受入条件
- [ ] AC-01: `npm test -- src/views/admin/__tests__/AdminPostsPage.test.tsx` が全ケース通過
- [ ] AC-02: ネガティブ検証 —
  - `AdminPostsPage.tsx:125` の `details: { municipality, species, info_type }` を `details: {}` に書き換えると TC-01 が失敗
  - `action: 'approve_post'` を `'approve'` に変えると TC-01 が失敗
  - `writeAuditLog` の呼び出し自体を削除すると TC-01〜04 すべて失敗
- [ ] AC-03: GitHub Actions CI の `npm test` ジョブで 3 回連続成功

## 影響範囲
- `src/views/admin/__tests__/AdminPostsPage.test.tsx`（拡張）
- Phase 2: `AdminCommentsPage.test.tsx`, `AdminReportsPage.test.tsx`（新規）
- 本体コードへの変更なし

## 優先度
Medium（監査ログは法令・運用上必須。ただし書き込み先は fire-and-forget でユーザー影響はないため P1 ではない）
