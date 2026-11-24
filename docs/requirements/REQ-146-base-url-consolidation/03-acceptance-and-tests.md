## 受入条件
- [ ] AC-01: `grep -rn "process\.env\.NEXT_PUBLIC_APP_URL" src/` の結果が `src/lib/constants.ts` の 1 行のみになっている。
- [ ] AC-02: `grep -rn "'https://zaridasu.com'" src/` の結果が `src/lib/constants.ts` の 1 行のみになっている（fallback 文字列の重複ゼロ）。
- [ ] AC-03: `npm run build` 成功（特に Server Component で `window` 参照エラーが出ない）。
- [ ] AC-04: `npm run lint` 成功。任意 ESLint ルール導入時は、constants.ts 以外で `process.env.NEXT_PUBLIC_APP_URL` を書くと lint エラーになることをドライランで確認。
- [ ] AC-05: `npm run test` 成功（既存テストに影響しない）。
- [ ] AC-06: `/sitemap.xml` をローカル `npm run dev` で取得し、ベース URL が変わっていないことを確認。
- [ ] AC-07: `/robots.txt` をローカル `npm run dev` で取得し、`Sitemap: https://zaridasu.com/sitemap.xml`（または `NEXT_PUBLIC_APP_URL` の値）が出ることを確認。
- [ ] AC-08: `/area` ページの JSON-LD `breadcrumbLd` の `item` フィールドが `${BASE_URL}/` と `${BASE_URL}/area` で出力されることを browser DevTools で確認。
- [ ] AC-09: 既存 E2E が緑のまま。

## テスト要件

### ユニット
- [ ] `src/lib/__tests__/constants.test.ts`（存在しない場合は新規）：
  - `NEXT_PUBLIC_APP_URL` が設定済みの場合、その値が `BASE_URL` に反映される。
  - 未設定時、`https://zaridasu.com` がフォールバックとして使われる。
  - 末尾スラッシュの有無のポリシーをテストで担保。
- [ ] 任意で `src/app/__tests__/sitemap.test.ts` / `src/app/__tests__/robots.test.ts`：
  - 生成される URL が `BASE_URL` を起点にしている。

### E2E
- [ ] 既存 sitemap / robots / area の E2E（あれば）が緑のまま。

### Lint
- [ ] 任意 ESLint ルール導入時は、`eslint --max-warnings 0` が通る。

