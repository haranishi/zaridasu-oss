### 実装内容

| FR | 実装 |
|---|---|
| 01 | `check-edge-deploy-lag.sh`: `_shared/` に差分があれば判定対象を全関数へ展開（除外は `.deploy-ignore` のみ）。skip 判定は展開後に評価 |
| 02 | 同スクリプトに **1.6節** を新設。「本番 `updated_at` < `_shared` 最終commit」を**差分に依存せず全関数**で評価。閾値は `WARN_HOURS`（24h）を流用 |
| 03 | `check-migration-drift.sh` に内容ドリフト検知。正規化は新規 `scripts/normalize-migration-sql.mjs`（コメント除去は文字列・識別子・ドル引用符を保護する状態機械） |
| 04 | 決定論的な `migration-gate` ジョブを新設し `deploy` の `needs` へ追加。`UNAPPLIED_SEVERITY=error` で (b) 方向を error に昇格 |
| 05 | `ci.yml` の一括 GRANT 後に、`grep -E '^REVOKE .* ON FUNCTION ' supabase/schema.sql` で導出した28文を再適用。0件チェック付き |
| 06 | `supabase/tests/req298_function_execute_privs.sql`（21アサーション）。**テスト自身は REVOKE を打たない**ので schema.sql の REVOKE が消えると落ちる |
| 07 | `supabase/ci/pgnet_vault_stub.sql` ＋ `supabase/tests/req298_webhook_wrappers.sql`（35アサーション）。実 migration を適用して定義のドリフトを防ぐ |
| 09 | `supabase/config.toml` を `[db.seed] enabled = false` に（理由をコメントで明記） |

### 「意図的に壊して赤くなること」の実証（すべて設定のコピーに対して実施・実ファイルは未変更）

| # | 壊した対象 | 結果 |
|---|---|---|
| 1 | `_shared` 単独変更コミット | skip の notice が出ず、全4関数から `.deploy-ignore` の1本を除いた3本が判定対象になる（AC-01） |
| 2 | 本番 `updated_at` を `_shared` より48h古く | `MODE=main` で error・exit 1／`MODE=pr` で warning・exit 0（AC-02） |
| 3 | 差分に `_shared` を含まない状態で同上 | それでも検知する（1.6節が差分非依存であることの確認） |
| 4 | `normalize-migration-sql.mjs` の stdin 読み取りを旧実装へ | 本番データで偽陽性が再現。修正版は3回連続で drift 0 |
| 5 | `schema.sql` コピーから `get_dormant_users` の `FROM anon` を1行削除 | 抽出28→27文。テスト 6/10/18 だけが落ちる（AC-05） |
| 6 | 同 `FROM PUBLIC` を1行削除 | 同じく 6/10/18 が落ちる |
| 7 | webhook migration コピーの `x-webhook-secret` 行を無効化 | テスト 12/32 が落ちる（AC-06） |
| 8 | secrets 未設定 | notice を出して exit 0（AC-09） |

CI harness を Docker で再現した状態での全 pgTAP: **16ファイル / 268テスト PASS**。`npm run type-check` / `npm run lint`（`--max-warnings 0`）/ `scripts` 単体テスト26件も green。

`check-edge-deploy-lag.sh` の検証は **bash 5.2 のコンテナ**で行った（macOS の `/bin/bash` は 3.2 で `mapfile`/連想配列が無く実行できない）。使い捨ての git リポジトリと偽 `supabase` CLI を用意し、実リポジトリには触れていない。

### 受入基準の状況

| AC | 状況 |
|---|---|
| AC-01 / AC-02 | ✅ 実証済み（上表 1〜3） |
| AC-03 | ✅ コメント差だけの `20260616000003` は一致、SQL文追加は別ハッシュ（単体テスト）。**除外リストは0件で運用**するため「除外理由の記載」は該当なし |
| AC-04 | ⏳ `migration-gate` を `deploy` の `needs` に入れ、`UNAPPLIED_SEVERITY=error` で exit 1 することはローカル（本番接続）で実測済み。**ただし GitHub Actions に `SUPABASE_ACCESS_TOKEN`/`SUPABASE_PROJECT_REF` が未登録のため、CI 上では migration-gate も既存 deploy-lag も skip（exit 0）で素通りしている**（AC-09 の安全側挙動）。ゲートが CI で実発火するのは secrets 登録後。実際の main push での確認も未実施 |
| AC-05 / AC-06 | ✅ 実証済み（上表 5〜7） |
| AC-07 | ⬜ FR-298-08（PG17）を別PRへ切り出したため未達 |
| AC-08 | ⏳ `enabled = false` にしたが `supabase start` の実行確認は未実施 |
| AC-09 | ✅ 実証済み |
| AC-10 | ✅ type-check / lint / テスト green |

### 運用への影響（要周知）

- **main へマージする前に `supabase db push` が必要**になった。手順は `docs/runbooks/migration-deploy-order.md`（本REQで新設）。
- 現在**本番未適用が3本**ある（`20260730000001`＝REQ-292 ／ `20260803000001`・`20260803000002`＝本REQ）。この状態で main へ push すると `migration-gate` が error になり `deploy` は実行されない。
- `_shared/` を変更したら、全関数を再デプロイするまで main の CI は赤くなる（意図した挙動）。

### ⚠️ CI で実発火させるには secrets 登録が必要（2026-08-03 実測）

GitHub Actions のリポジトリ secrets / variables に `SUPABASE_ACCESS_TOKEN` と `SUPABASE_PROJECT_REF` が**登録されていない**（`gh secret list` で確認）。そのため:

- `migration-gate` も既存の `edge-functions-deploy-lag` も、**CI 上では毎回 skip（notice + exit 0）**している。本番 DB を見に行けないため。
- ゲートのロジック自体は**ローカル（本番接続）で 8 通り実証済み**だが、**CI で実際に赤くする効果は secrets 登録後に初めて出る**。
- これは REQ-298 AC-09（secrets 未設定なら壊さない）の設計どおりの安全側挙動であり、バグではない。ただし「CI が緑だから順序ゲートが効いている」とは**読めない**点に注意。
- secrets 登録は「本番トークンを GitHub に保持する」判断のため、PR マージとは切り離して別途決める（2026-08-03 時点は本人判断で保留）。
