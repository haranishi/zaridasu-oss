## 背景

develop 89495e9 時点で `npm run type-check`（`tsc --noEmit`）と `npm run lint`（`eslint . --max-warnings 0`）はどちらも exit 0 である。問題は「CI が緑であること」ではなく、**緑の範囲が狭いこと**である。本番の非同期基幹（Edge Function 14 本）・CI の門番スクリプト・e2e 33 件・カバレッジ閾値がいずれも実効ゲートの外にある。

### 問題A: Edge Function に型チェックゲートが一切なく、現に型エラーが 1 件残存している — High

二重に除外されている。

- `.github/workflows/ci.yml:145`: `deno test --allow-env --allow-net --allow-read --lock=supabase/functions/deno.lock --cached-only --no-check supabase/functions/`（**`--no-check`**）
- `tsconfig.json` の `exclude`: `["node_modules", ".next", "dist", "supabase/functions", "tests/e2e", "scripts"]`（**`supabase/functions` を除外**）

結果、Edge Function 14 本（メール通知・Web Push・AI 判定＝本番の非同期基幹）は**どの CI ジョブからも型検査されていない**。

`ci.yml:143-144` のコメントは

```
# --no-check: @types/node 解決のための node_modules を edge-functions ジョブでは
# 用意しない（npm ci 不要）。型チェックは別ジョブ (typecheck / lint) でカバー済み。
```

と書いているが、**「別ジョブでカバー済み」は事実に反する**。`tsconfig.json` が `supabase/functions` を除外しているため typecheck ジョブは 1 ファイルも見ておらず、`eslint.config.js` も `src/**` しか対象にしていない（問題B 参照）。

**実測（2026-07-30 / develop 89495e9）**:

```
$ deno check --lock=supabase/functions/deno.lock supabase/functions/**/*.ts
TS2538 [ERROR]: Type 'null' cannot be used as an index type.
    const speciesLabel = SPECIES_LABELS[record.species] ?? record.species ?? '不明'
                                        ~~~~~~~~~~~~~~
    at .../supabase/functions/notify-post-status/index.ts:143:41
error: Type checking failed.
```

対象 49 ファイル（`supabase/functions` 配下の全 `.ts`、`__tests__` 含む）に対し**エラーはこの 1 件のみ**。`record.species` は同ファイル `:106-114` のローカル型注釈で `species: string | null` と宣言されており、それを添字に使っている。

REQ-287 のコミット `add5ffa` の本文にも自認が残っている: 「なお notify-post-status の deno check TS2538（record.species）は本変更前から存在する既存エラーで、CI は --no-check のため未ゲート。」

> [!important] `--no-check` は無意味に付いたものではない
> `--no-check` を入れたコミット `8118e0e` の理由は「`esm.sh/@supabase/supabase-js@2` の型定義が `@types/node` を参照しており、edge-functions ジョブは `npm ci` を回さないため `node_modules` が無く *Could not find @types/node* で CI が落ちた」である。上記の実測は `node_modules` が存在するローカルでの結果なので、**`deno check` をそのまま edge-functions ジョブへ足すと同じ失敗が再発する可能性がある**。ジョブ設計は FR-297-01 の判断点として扱う。
