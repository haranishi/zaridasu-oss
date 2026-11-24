## ⚠️ 再開時に踏みやすい罠（環境・ツール）

2026-07-31 に実測で判明したもの。知らないと確実に時間を溶かす。

| 罠 | 実際に起きること | 対処 |
|---|---|---|
| **Codex はサンドボックス内で Chrome を起動できない** | LHCI が `connect EPERM 127.0.0.1:9222` で失敗。`npx` も `ENOTFOUND registry.npmjs.org` になる | **ブラウザを立てる計測は親（Claude Code の Bash）で実行する。** `CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"` を付ける |
| **Lighthouse 12.1.0 は `settings.preset: "mobile"` を受け付けない** | `Invalid values: Argument: preset, Given: "mobile", Choices: "perf", "experimental", "desktop"` | `formFactor: "mobile"` ＋ throttling / screenEmulation を明示指定する（`.lighthouserc.mobile.json` が実例） |
| **Deno 2.9.3 の `deno check` は `--cached-only` 非対応** | `unexpected argument '--cached-only'` で exit 1。`deno test` 側は対応している | `deno check` には付けない。CDN 遮断は `deno cache --frozen` ＋ `deno test --cached-only` で担保する |
| **bash の `**` は globstar 無効だと1階層に退化する** | `supabase/functions/**/*.ts` が **49件中29件**しかマッチせず、`__tests__` を取りこぼしたまま静かに緑になる | CI でファイル集合を作るときは `find` ＋**件数のログ出力と0件チェック**にする（`edge-functions` ジョブの `Type-check Edge Functions` が実例） |
| **macOS の `/bin/bash` は 3.2 で globstar 自体が無い** | ローカルで globstar の挙動を検証しようとしても `shopt: globstar: invalid shell option name` になり、**CI（bash 5.x）の挙動を再現できない** | ローカル検証結果を「CI でもこうなる」と断定しない。glob に依存しない書き方にするのが早い |
| **`npm run build` が `.next/server/pages-manifest.json` の ENOENT で落ちる** | 並行作業で `.next` が中途半端になっているだけ | `rm -rf .next` してから再実行。コード側の問題ではない |
| **LHCI がローカル実行のたびに `.lighthouseci/` を 14MB 生成する** | `git status` が汚れる | `.gitignore` 済み（2026-07-31 追加）。既に生成済みなら消してよい |
| **CI の TBT はローカルの4〜10倍で、しかも実行ごとに2.5倍振れる** | ローカル最大 231ms に対し CI は **868〜2213ms**（同一コード・2実行）。倍率を見積もって閾値を置く方法が2回続けて外れ、mobile TBT の error 化は断念して **warn** にした | **実行時性能の閾値は、ゲートが実際に走る環境で「複数回」測ってから決める。** 1回だと ばらつきが見えない。**測った結果ゲートに向かない指標だと分かったら、無理に error 化せず決定論的な代替指標を主ゲートに据える**（今回は `size:routes` のバイト計測。実行環境に依存しないので CI でも安定して通る） |
| **Playwright の `webServer.timeout` は本番ビルド1回ぶんを含む** | `command` が `npm run build && npm run start` なので、300s ではビルド途中で `Timed out waiting 300000ms from config.webServer.` になる（実測 5分2秒 でちょうど境界だった） | 600s へ引き上げ済み。ジョブの `timeout-minutes: 30` に収まる範囲で余裕を取る |
| **`schema-drift` ジョブが Docker レジストリのレート制限で落ちることがある** | `public.ecr.aws/supabase/postgres-meta` の取得が `toomanyrequests: Rate exceeded` になり exit 125。**コードの問題ではない** | 再実行で解消する。ログに `toomanyrequests` があればコードを疑わない |
| **macOS の `/bin/bash` 3.2 では `check-edge-deploy-lag.sh` を実行できない** | `mapfile` と `declare -A` を使っているので構文エラー。ローカルで動かせず「動くはず」で通してしまう | **Docker で bash 5 を使う**。使い捨ての git リポジトリ＋偽 `supabase` CLI を用意すれば実リポジトリを汚さず全シナリオを実測できる（2026-08-03 に `deploylag_harness.sh` でこの形を確立） |
| **Node で stdin を `raw += chunk` と読むと UTF-8 が壊れる** | chunk は Buffer。チャンクごとに `toString()` すると、マルチバイト文字が境界で分断されて U+FFFD に化ける。**パイプでは化けるがファイルリダイレクトでは化けない**ので、検証方法を間違えると再現しない。分断位置は実行ごとに変わるため症状が非決定的 | `Buffer.concat(chunks).toString('utf8')` で**全チャンク連結後に1度だけ**文字列化する。回帰テストは**必ずパイプ（`execFileSync` の `input`）で**流すこと |
| **`ALTER DEFAULT PRIVILEGES ... REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC` は効かない** | PG16 実測で `pg_default_acl` に行が作られず、直後に作った関数は PUBLIC 実行可のまま。`REVOKE ... FROM anon` は**直接付与しか剥がさない**ので anon は PUBLIC 経由で実行できる | 関数を anon から閉じるには **`FROM PUBLIC` の REVOKE が必須**。REQ-292 の5関数のように `FROM PUBLIC` と `FROM anon` の2行セットで書く |
| **codex サブエージェントを並列起動すると `-o` の出力ファイルが混線する** | 兄弟プロセスが同じ scratchpad の `codex-out.txt` へ書き、先に終わった方の回答が上書きされる。**別タスクの回答を自分の結果だと誤読する**事故になる | `-o` のファイル名にセッションID等のユニーク接尾辞を付ける。混線を疑ったら `~/.codex/sessions/` のロールアウト JSONL から本物を復元できる |

---
