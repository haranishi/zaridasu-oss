## 背景

feat/security-hardening ブランチの GitHub Actions CI が 2026-07-09 の push（リモート先端 `2e1539c`）以降、赤のまま放置されている。
最新のリモート CI 実行（run [28990510913](https://github.com/haranishi/zaridasu/actions/runs/28990510913)）では 12 ジョブ中 4 ジョブが失敗した。

| ジョブ | 結論 | 失敗内容 |
|---|---|---|
| edge-functions | failure | `deno cache --frozen` が「The lockfile is out of date」で3回リトライ全滅 |
| test | failure | `src/lib/hash/__tests__/sha256.test.ts` 3件失敗（`sha256Hex` が `null` を返す＝CI の jsdom+Node 環境に `crypto.subtle` が無い） |
| rls-tests | failure | pgTAP 3ファイル失敗（`rls_posts.sql` Bad plan 48→45／`rate_limit_public_endpoints.sql` permission denied for table posts／`grant_hardening_internal_tables.sql` test 19 not ok） |
| e2e | failure | `tests/e2e/error-boundary.spec.ts` の404テストがリトライ含め2回失敗し、`maxFailures: 1` により残り21テストが未実行のまま中断 |

このうち **edge-functions / test / rls-tests の3ジョブはローカルで修正済み**（`c2704e7`＝deno.lock 同期＋crypto.subtle ポリフィル、`77fdf65`＝pgTAP fixture 3件の現行スキーマ追随）だが、**2コミットとも未push**（`git status -sb` → `[ahead 2]`）であり、リモート CI は修正前の状態で赤が継続している。

**e2e の失敗のみ、どのローカルコミットでも未対応**の別問題である。

CI が赤のままだと main へのマージ（＝セキュリティ強化16コミットの本番デプロイ）がブロックされ続ける。
