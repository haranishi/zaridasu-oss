# REQ-165: AdminLoginPage テストの rpcMock 引数アリティ不一致による type-check 失敗（回帰）

## 背景
REQ-149（管理ログインのサーバー側レート制限＋監査）で、`AdminLoginPage` は `supabase.rpc('admin_login_check', ...)` /
`supabase.rpc('admin_login_record', ...)` を呼ぶようになった。これに伴いユニットテスト
`src/views/admin/__tests__/AdminLoginPage.test.tsx` の Supabase モックに `rpc` を追加したが、モック関数 `rpcMock` の
TypeScript シグネチャが1引数のまま、呼び出し側が2引数で呼んでいるため、`tsc --noEmit` で型エラーになる。

Vitest（esbuild トランスパイル）では型チェックを行わないためテスト自体は通過するが、CI の `npm run type-check`
（`test` ジョブ）が失敗する。

## 現状の問題
- `src/views/admin/__tests__/AdminLoginPage.test.tsx:10-13` 付近で
  ```ts
  const rpcMock = vi.fn((fn: string) => { ... })   // 1 引数で型推論される
  ```
  と定義されている。
- `:21` で
  ```ts
  rpc: (fn: string, args?: unknown) => rpcMock(fn, args)   // 2 引数で呼ぶ
  ```
  と呼んでおり、`rpcMock` の推論型 `(fn: string) => ...` に対し2引数を渡すため、
  `error TS2554: Expected 1 arguments, but got 2`（`AdminLoginPage.test.tsx:21:54`）が発生する。
- CI `test` ジョブの `npm run type-check` が exit 2 で失敗する。

### 再現
```
npm run type-check
# => src/views/admin/__tests__/AdminLoginPage.test.tsx(21,54): error TS2554: Expected 1 arguments, but got 2.
```

## 目的
`rpcMock` を2引数（関数名＋引数オブジェクト）で呼べる型に修正し、`npm run type-check` を通過させる。
テストの挙動（admin_login_check / admin_login_record のモック応答）は一切変えない。

## 要件
### 機能要件
- [ ] FR-165-01: `rpcMock` のシグネチャを2引数許容に修正する（例: `vi.fn((fn: string, _args?: unknown) => {...})`）。
- [ ] FR-165-02: モックの戻り値（`admin_login_check` → `{ data: { locked: false, retry_after_seconds: 0 }, error: null }`、
  その他 → `{ data: { locked: false }, error: null }`）は現状を維持する。
- [ ] FR-165-03: 既存2テスト（正常ログイン → /admin リダイレクト、認証失敗 → エラー表示）が引き続き通過すること。

### 非機能要件
- [ ] NFR-165-01: 本修正はテストコードのみの変更とし、`AdminLoginPage.tsx` 本体は変更しない。

## 受入条件
- [ ] AC-01: `npm run type-check` が `AdminLoginPage.test.tsx` に関する TS2554 を出さず完了する。
- [ ] AC-02: `npx vitest run src/views/admin/__tests__/AdminLoginPage.test.tsx` が全通過する。
- [ ] AC-03: CI `test` ジョブが type-check で失敗しない（他の既存型エラー REQ-166 を別途解消後にグリーン）。

## 影響範囲
- `src/views/admin/__tests__/AdminLoginPage.test.tsx`（モック定義のみ）

## 優先度
- **緊急度**: High / **重要度**: Medium
- **理由**: main の CI を赤にしている回帰であり、修正は1行・低リスク。早期に解消すべき。
