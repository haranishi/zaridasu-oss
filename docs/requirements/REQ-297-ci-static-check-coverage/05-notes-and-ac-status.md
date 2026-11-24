### `@types/node` 判断点の実測と採用方針

`supabase/functions` と `deno.lock` を `/tmp/deno-nodemod-probe.*` へコピーし、
`node_modules` が存在しないことを確認して全 `.ts` に `deno check` を実行した。
修正前は既知の TS2538 だけが検出され、修正後は exit 0 だった。
したがって `@types/node` 解決エラーは再現せず、edge-functions ジョブへの `npm ci` 追加は採用しなかった。

Deno 2.9.3 では `deno check --cached-only` 自体が
`unexpected argument '--cached-only'`（exit 1）になる。そこで既存の
`deno cache --lock=... --frozen`（retry 付き）を維持し、その直後に
`deno check --lock=...` を実行する。`deno check` は `--reload` を指定しない限り
キャッシュ済み依存を再利用する。`deno test` では引き続き `--cached-only` を使い、
テスト実行時の CDN アクセスを遮断する。

### カバレッジ閾値を実測ベースに置き直した理由

旧値 65 / 50 / 50 / 70 は CI から一度も呼ばれておらず、2026-07-31 の実測
61.02 / 48.15 / 52.08 / 64.19% に対して3指標が未達だった。これは運用中のゲートを
「引き下げた」のではなく、機能していなかった飾りの値を、現在の実測より約1ポイント低い
実効ゲートへ初めて置き換えたものである。旧値は REQ-311 のテスト追加で回収する目標値とし、
今後は 60 / 47 / 51 / 63 から下げないラチェット運用とする。

### ゲート発火実証

| ゲート | 何を壊したか | 期待 | 実際 |
|---|---|---|---|
| Deno 型検査 | `SPECIES_LABELS[record.species]` を一時復元 | 非0で nullable 添字を検知 | exit 1、`TS2538 [ERROR]: Type 'null' cannot be used as an index type.` |
| カバレッジ | statements 閾値を一時的に 99 に変更 | 非0で閾値未達を検知 | exit 1、`Coverage for statements (61.02%) does not meet global threshold (99%)` |
| scripts 型検査 | `const req297TypeGateProbe: string = 297` を一時追加 | 非0で `scripts/` の型不整合を検知 | exit 2、`TS2322: Type 'number' is not assignable to type 'string'.` |
| e2e lint | `tests/e2e/post.spec.ts` に未使用変数を一時追加 | 非0で e2e の lint 違反を検知 | exit 1、`@typescript-eslint/no-unused-vars` 1 error |

上記の一時変更はすべて直後に復元した。復元後の lint / type-check / coverage / Deno check はすべて exit 0。

### AC-01〜AC-08 到達状況

| AC | 状況 | 確認内容 |
|---|---|---|
| AC-01 | 達成 | 全 Edge Function の `deno check` が exit 0。CI の `edge-functions` ジョブにも hard-fail ステップを追加。 |
| AC-02 | 達成 | 誤コメントの grep は0件（grep exit 1）。 |
| AC-03 | 達成 | scripts / e2e / `next.config.ts` の `eslint --print-config` はいずれも設定を返した。 |
| AC-04 | 達成 | `scripts` / `tests/e2e` を除外しない状態で type-check exit 0。 |
| AC-05 | 達成 | CI を coverage 実行へ置換し、閾値99の発火実証で exit 1を確認。 |
| AC-06 | 達成 | `find src -name "*.test.js" \| wc -l` は0。 |
| AC-07 | CI実行後に確認 | artifact の配線と SHA ピン留めは完了。実際の失敗CIからのダウンロードと trace オープンはCI実行後に確認する。 |
| AC-08 | 達成 | lint / type-check / unit 789 tests / Edge 258 tests がすべて PASS。 |
