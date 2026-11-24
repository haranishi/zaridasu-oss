## 機能要件

- **FR-297-01（Edge Function 型ゲート）**: `supabase/functions` 配下の全 `.ts` に対する `deno check` を CI の必須ジョブに追加し、あわせて既存の `TS2538` を解消する。
  - 既存エラーの修正: `supabase/functions/notify-post-status/index.ts:143` の添字を非 null に確定させる（例 `SPECIES_LABELS[record.species ?? ''] ?? record.species ?? '不明'`）。**表示文言の挙動を変えないこと**（`record.species` が null のとき従来どおり `'不明'` になる）。
  - `ci.yml:143-144` の誤ったコメント（「型チェックは別ジョブ (typecheck / lint) でカバー済み」）を事実に合わせて訂正する。
  - **判断点**: `@types/node` 解決のため、(a) edge-functions ジョブに `npm ci` を足す、(b) `deno check` だけ typecheck ジョブ（`npm ci` 済み）側で実行する、(c) `supabase/functions/deno.json` で型解決を明示する、のいずれかを選ぶ。`--lock=supabase/functions/deno.lock` と `--cached-only` は既存の CDN flake 対策（REQ-050 由来）を壊さないよう維持する。
- **FR-297-02（scripts / e2e / root config の静的検査）**: `eslint.config.js` に `files: ['scripts/**/*.{ts,mjs}', '*.config.{ts,js}', 'vitest.setup.ts']`（node globals・`no-console` off）と `files: ['tests/e2e/**/*.ts']` のブロックを追加し、`ignores` から `tests/e2e/**` を外す。`tsconfig.json` の `exclude` から `scripts` と `tests/e2e` を外す。
  - **方針**: 対象を広げた結果として型エラー・lint エラーが出るなら、**それ自体が本要件の収穫**である。件数が多い場合は「まず `tests/e2e` を戻す」「次に `scripts` を戻す」の 2 段で入れてよいが、除外に戻すことで緑にするのは本要件の不達成とみなす。
- **FR-297-03（カバレッジ強制とラチェット運用）**: CI で `npm run test:coverage` を実行し、`vitest.config.ts` の閾値を実効ゲートにする。実行時間が問題になる場合は unit テストと別ジョブに分ける。緑になった実測値まで閾値を引き上げ、以後は下げないラチェット運用にする（引き上げた値と実測日を `vitest.config.ts` のコメントに残す）。
- **FR-297-04（`.js` テストの `.ts` 化）**: 問題D の 6 本を `.ts` へリネームし、型検査対象に入れる。`vi.hoisted` を使う `usePostForm.test.js` は型注釈の追加が必要になる。段階導入する場合は `checkJs: true` を `src/**/__tests__/**` 限定で有効化する暫定手段も可とするが、最終形は `.ts` 化とする。
- **FR-297-05（e2e の可観測性）**: `playwright.config.ts` の `maxFailures` を緩和する（例 CI で 5）。e2e ジョブに `if: failure()` の `actions/upload-artifact` を追加し、`playwright-report/` と `test-results/` を成果物として回収する。`workers: 1` / `fullyParallel: false` は placeholder Supabase 構成の直列前提に依存するため本要件では変更しない（REQ-311 の e2e 系統追加とあわせて再検討する）。

## 受入基準

- **AC-01（Edge Function 型ゲート）**: 以下が exit 0 で、かつ同等のジョブが CI の必須チェックとして実行されている。
  ```bash
  deno check --lock=supabase/functions/deno.lock supabase/functions/**/*.ts
  ```
- **AC-02（誤コメントの解消）**: `.github/workflows/ci.yml` に「型チェックは別ジョブ (typecheck / lint) でカバー済み」の記述が残っていない。
  ```bash
  grep -n "typecheck / lint) でカバー済み" .github/workflows/ci.yml   # 期待: 0 件
  ```
- **AC-03（scripts / e2e / config の lint 適用）**: 下記がいずれも `undefined` を返さない（設定ブロックに一致する）。
  ```bash
  npx eslint --print-config scripts/check-schema-types-sync.ts | head -c 40
  npx eslint --print-config tests/e2e/post.spec.ts             | head -c 40
  npx eslint --print-config next.config.ts                     | head -c 40
  ```
- **AC-04（scripts / e2e の型検査）**: `tsconfig.json` の `exclude` に `scripts` と `tests/e2e` が無い状態で `npx tsc --noEmit` が exit 0。
- **AC-05（カバレッジ強制）**: `grep -n coverage .github/workflows/ci.yml` が 1 件以上ヒットし、閾値を下回る変更を入れた PR で CI が fail する。
- **AC-06（`.js` テストの解消）**: `find src -name "*.test.js" | wc -l` が **0**。
- **AC-07（e2e 成果物）**: e2e を意図的に失敗させた実行で、`playwright-report/` が CI の Artifacts からダウンロードでき、trace が開ける。
- **AC-08**: `lint` / `type-check` / 既存 652 テストがパスする。Edge Function の Deno テストもパスする。

## 対象外

- Edge Function のハンドラテスト追加（未テスト 5 本）は REQ-311 の範囲。本要件は「型検査ゲートを設けること」に限る。
- 認証・DB を伴う e2e フローの追加は REQ-311 の範囲。本要件は既存 e2e の可観測性（artifact・maxFailures）のみ扱う。
- `deno.lock` の依存更新（Edge 側 supabase-js が npm 側と別バージョンで固定されている件）は REQ-288 / 別途の範囲。

## 要確認

- FR-297-01 の判断点（`@types/node` 解決方法）は実際に CI で試すまで確定しない。ローカルの実測は `node_modules` が存在する状態での結果である。
- FR-297-02 で `scripts` / `tests/e2e` を型検査対象に戻したときのエラー件数は未計測（除外を外して `tsc --noEmit` を回す破壊的でない検証は可能だが、本監査は読み取り専用で実施していない）。
- FR-297-03 でカバレッジ実行を追加した場合の CI 実行時間増は未計測。現行の unit テストは 71 ファイル / 652 件で約 5.6 秒（ローカル実測）。
