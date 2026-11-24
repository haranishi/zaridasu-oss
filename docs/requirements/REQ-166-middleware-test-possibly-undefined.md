# REQ-166: middleware テストの「Object is possibly 'undefined'」型エラー（既存）

## 背景
`src/lib/supabase/__tests__/middleware.test.ts` は REQ-137（fail-closed redirect）等を検証するユニットテストで、
`logErrorMock.mock.calls[0][1]` のようにモック呼び出し履歴へインデックスアクセスしている。
`tsconfig` の `noUncheckedIndexedAccess` 相当の厳格設定下では配列インデックスアクセスが `T | undefined` になるため、
`mock.calls[0]` が `undefined` の可能性を持ち、続く `[1]` アクセスで型エラーになる。

このエラーは REQ-147〜164 の変更より前から存在していた既存問題だが、CI `test` ジョブの `npm run type-check` を
失敗させている。

## 現状の問題
- `src/lib/supabase/__tests__/middleware.test.ts` の以下3箇所:
  - `:90` `expect(logErrorMock.mock.calls[0][1]).toBe('middleware:updateSession')`
  - `:99` 同上
  - `:111` 同上
- いずれも `logErrorMock.mock.calls[0]` が `undefined` 可能性を持つため
  `error TS2532: Object is possibly 'undefined'` が発生する。
- CI `test` ジョブの `npm run type-check` が exit 2 で失敗する。

### 再現
```
npm run type-check
# => src/lib/supabase/__tests__/middleware.test.ts(90,12): error TS2532: Object is possibly 'undefined'.
#    ...(99,12) (111,12) も同様
```

## 目的
インデックスアクセスに型安全なガード/アサーションを与え、`npm run type-check` を通過させる。
テストの検証内容（`logError` が `'middleware:updateSession'` を第2引数で呼ばれること）は維持する。

## 要件
### 機能要件
- [ ] FR-166-01: `:90 / :99 / :111` の `logErrorMock.mock.calls[0][1]` を型安全にする。次のいずれかで対応:
  - (a) 直前に `expect(logErrorMock).toHaveBeenCalled()` を担保したうえで `logErrorMock.mock.calls[0]![1]` の non-null アサーション、
  - (b) `const [, secondArg] = logErrorMock.mock.calls[0] ?? []` 等の分割代入＋ガード、
  - (c) `logErrorMock.mock.lastCall?.[1]` の利用。
- [ ] FR-166-02: 3箇所すべてで同一方針を適用し、一貫性を保つ。

### 非機能要件
- [ ] NFR-166-01: テストの検証ロジック（呼び出し回数・第2引数の値）を変えないこと。
- [ ] NFR-166-02: （任意）同種の `mock.calls[n][m]` パターンがプロジェクト内の他テストにもないか棚卸しし、方針を共有する。

## 受入条件
- [ ] AC-01: `npm run type-check` が `middleware.test.ts` の TS2532 を出さず完了する。
- [ ] AC-02: `npx vitest run src/lib/supabase/__tests__/middleware.test.ts` が全通過する。
- [ ] AC-03: REQ-165 と本件の解消により CI `test` ジョブの type-check ステップがグリーンになる。

## 影響範囲
- `src/lib/supabase/__tests__/middleware.test.ts`（テストコードのみ）

## 優先度
- **緊急度**: High / **重要度**: Medium
- **理由**: main CI を赤にしている既存型エラー。修正は局所的・低リスクで、REQ-165 とあわせて type-check を通すために必須。
