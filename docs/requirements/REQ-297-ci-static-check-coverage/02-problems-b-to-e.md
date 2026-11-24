### 問題B: `scripts/` と `tests/e2e/` が lint も tsc も通っていない — Medium

- `tsconfig.json` の `exclude` に `tests/e2e` と `scripts` が含まれる（＝`tsc --noEmit` の対象外）
- `eslint.config.js:13` の `ignores` に `tests/e2e/**` が含まれる
- `eslint.config.js:18` は `files: ['src/**/*.{js,jsx}']`、`:59` は `files: ['src/**/*.{ts,tsx}']`。そのため **`scripts/**` とリポジトリ直下の config 群はどの設定ブロックにも一致しない**

**実測（`npx eslint --print-config`）**:

| 対象 | 結果 |
|---|---|
| `src/lib/constants.ts` | 115 ルール適用 |
| `scripts/check-schema-types-sync.ts` | **undefined（設定なし）** |
| `tests/e2e/post.spec.ts` | undefined |
| `next.config.ts` | undefined |

`scripts/` は `tsconfig.json` からも除外され、実行は `tsx`（トランスパイルのみ・型検査なし）である。つまり **CI の門番である `check-schema-types-sync.ts`（`npm run schema:check`）・`check-i18n-parity.ts`（`npm run i18n:check`）・`calc-ai-cost.ts`・`eval-ai-analysis.ts` は静的検査ゼロ**で運用されている。「schema と型の乖離を検知する仕組み」自体が壊れても、壊れたことを検知する層が無い。

e2e 33 件も同様に型検査・lint 対象外で、セレクタや Playwright API の誤用が実行時まで露見しない。

### 問題C: カバレッジ閾値が CI で強制されていない — Medium

`vitest.config.ts:13-18` に閾値がある。

```ts
thresholds: { statements: 65, branches: 50, functions: 50, lines: 70 },
```

一方 `.github/workflows/ci.yml:47` は `- run: npm test`（`vitest run`）であり、`npm run test:coverage`（`vitest run --coverage`）は**どのジョブからも呼ばれていない**（`ci.yml` 全文の `coverage` grep が 0 件）。閾値はローカルで意識的に叩いたときだけ効く「飾り」の状態である。REQ-282 で `coverage/` を git 追跡から外した際に、閾値強制の運用が未整備のまま残った。

### 問題D: `.js` のままのテスト 6 本が型検査から外れている — Low

`tsconfig.json` は `allowJs: true` / `checkJs: false` なので、`include` に入っていても `.js` テストは型検査されない。

| ファイル | 行数 |
|---|---:|
| `src/hooks/posts/__tests__/usePostForm.test.js` | 297 |
| `src/lib/__tests__/errorHandler.test.js` | 177 |
| `src/hooks/__tests__/useReverseGeocode.test.js` | 171 |
| `src/lib/__tests__/constants.test.js` | 163 |
| `src/hooks/posts/__tests__/useDeletePost.test.js` | 100 |
| `src/lib/__tests__/storage.test.js` | 70 |

投稿フローの主要テストである `usePostForm.test.js` が対象で、`UsePostFormResult`（`src/types/index.ts:91-112`）のフィールド名を変えてもコンパイル時に壊れず、「古い API 形状のままのテストが通り続ける」状態になり得る。

### 問題E: e2e が最初の失敗で打ち切られ、trace を CI から回収できない — Low

`playwright.config.ts`:

- `:8-10` `fullyParallel: false` / `workers: 1` / `maxFailures: process.env.CI ? 1 : undefined` → **CI では 1 件目の失敗で suite 全体が中断**する。認証やレイアウトのように複数テストを同時に壊す変更では 1 件しか見えず、修復が直列化する。
- `:16-18` `trace: 'retain-on-failure'` / `screenshot: 'only-on-failure'` により成果物自体は生成される。しかし e2e ジョブ（`ci.yml:84` の `- run: npm run e2e`）に `actions/upload-artifact` ステップが無いため、**失敗時の trace / スクリーンショットを CI から取り出せない**。ローカル再現が必須になる。
