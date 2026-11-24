## カバレッジ目標
- `src/lib/supabase/middleware.ts:35-60` の `isAdminRoute` / `/dashboard` 分岐と各 early-return パスで branch coverage 100%
- `src/lib/supabase/middleware.ts:63-67` の `catch` ブロック到達 1 回以上（TC-06）
- `updateSession` 関数自体の statements coverage ≧ 95%

## テストデータ / フィクスチャ
インライン（ファイル内）にユーザーモックを定義。別ファイル分割は不要。

```ts
const mockUsers = {
  anon:  { data: { user: null }, error: null },
  user:  { data: { user: { id: 'u1', app_metadata: { role: 'user' } } }, error: null },
  admin: { data: { user: { id: 'a1', app_metadata: { role: 'admin' } } }, error: null },
}
```

## 受入条件
- [ ] AC-01: `npm test -- src/lib/supabase/__tests__/middleware.test.ts` がグリーン（6 TC すべて pass）
- [ ] AC-02: ネガティブ検証 — `src/lib/supabase/middleware.ts:54` の `supabase.auth.getUser()` を `supabase.auth.getSession()` に戻すと、モックは `getSession` を実装していないため TC-05 が RED になる。加えて `middleware.ts:63-67` の `try/catch` を削除すると TC-06 が RED になる
- [ ] AC-03: GitHub Actions（`.github/workflows/ci.yml`）で 3 回連続グリーン（flaky ではない）

## 影響範囲
- 新規: `src/lib/supabase/__tests__/middleware.test.ts`
- 既存: なし（読み込み・モック側で完結、`src/lib/supabase/middleware.ts` に変更なし）
- CI: 既存の `npm test` で自動実行される（ワークフロー変更不要）

## 優先度
- **緊急度**: 高
- **重要度**: Critical
- **理由**: `updateSession` は `/admin/*` の認可における唯一のゲートで、ここがバイパスされると管理画面の全操作が漏洩する。REQ-035 で getUser に変更済みだが、テスト不在のため簡単な refactor で逆行しうる。
