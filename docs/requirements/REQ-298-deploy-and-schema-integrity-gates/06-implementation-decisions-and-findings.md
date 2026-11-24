## 実装記録（2026-08-03）

状態: **FR-298-01〜07 / 09 実装済み**（FR-298-08 は別PRへ切り出し）。PR #31（base: `develop`）へ追加。

### 着手前に確定した判断

| # | 論点 | 決定 | 理由 |
|---|---|---|---|
| 1 | ゲート化する判定の範囲 | **(a)+(b)+(c) すべて**（選択肢C相当） | 順序事故を機械的に防ぐ層が他に無い。決定論的な判定のみを採用した |
| 2 | 関数 EXECUTE の REVOKE 再確定方式 | **schema.sql からの導出**（選択肢A/Bのいずれでもない） | A/B はどちらも「schema.sql に足したら宣言側にも足す」人手同期が要り、**その追記漏れ自体が本REQの課題**。導出なら原理的に漏れない |
| 3 | seed.sql の扱い | **B: `[db.seed] enabled = false`** | 空ファイルは「シードを使う運用なのに書き忘れ」と誤読される。実際はテストデータを migration と pgTAP fixture で用意しており seed.sql を使う設計ではない |
| 4 | 内容ドリフトの除外リストの粒度 | **除外0件で運用**（機構は用意しない） | 実測の結果、除外が必要なのは1件だけで、それは是正すべき実バグだった（下記）。ベースライン3本は**一致していた**ので要件の想定と異なり除外不要 |
| 5 | 判定を別ジョブへ切り出すか | **B: 別ジョブ `migration-gate`** | deploy-lag は時刻依存で決定論的でない。ゲートは決定論的な判定だけで構成する |

### 実装前に実測したこと（要件書の「要確認」への回答）

- **`statements` の実データ形式**: `text[]`（1要素＝1SQL文）。**コメントは保持され、末尾のセミコロンだけが除去される**。本番59行すべて非NULL・非空。よって `array_to_string(statements, ';')` とリポジトリの `.sql` は、末尾セミコロンと空白を除けば一致する。要件が代替案としていた「ハッシュを別テーブルに記録する方式」は不要だった。
- **`postgresql-17-pgtap` の入手可否**: PGDG bookworm に **存在する**（1.3.4-1.pgdg12+1。`postgresql-16-pgtap` と同一リビジョン）。FR-298-08 の前提は解消済みだが、PG17 で `schema.sql` が通るかは未検証のため別PRとした。

### 実測で見つかった実在の欠陥（いずれも本REQで是正）

**1. `20260513000014` の内容ドリフト（要件が予測した「問題B (c)」の実例）**

全59本を正規化ハッシュで突合したところ、**58本一致・1本不一致**。不一致だった `20260513000014_protect_official_flag_service_role_bypass.sql` は、REQ-208 の修正時に**適用済みファイルを直接書き換え**られていた。version が同じなので `supabase db push` は二度と流さず、本番だけ REQ-208 前の定義のまま動いていた（`pg_get_functiondef()` で実測確認）。`schema.sql` は新版だったため **CI は新挙動をテストし、本番は旧挙動**という乖離が生じ、どのゲートも検知していなかった。

是正: ファイルを「実際に適用された内容」へ巻き戻し、REQ-208 版は新規 `20260803000001` に切り出した。これで突合は **59/59 一致・除外0件**。

**2. `ALTER DEFAULT PRIVILEGES ... REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC` が no-op**

`schema.sql:27` のこの行は「以降に作る関数の PUBLIC への自動 EXECUTE 付与を止める」意図だったが、PostgreSQL 16 で実測すると **`pg_default_acl` に行が1件も作られず**、直後に作った関数の `proacl` は NULL（＝PUBLIC が EXECUTE を持つ既定）のままだった。

その結果 `REVOKE EXECUTE ON FUNCTION f FROM anon` は anon への**直接付与しか剥がさず**、PUBLIC 経由で anon が実行できる状態が残る（`has_function_privilege` も true を返す）。REQ-292 の5関数だけが `FROM PUBLIC` と `FROM anon` の2行セットになっており、そこでは対処されていた。

本番実測（2026-08-03）:

| 関数 | proacl | anon 実行 |
|---|---|---|
| `detect_ai_anomalies` | `{=X/postgres,...}` | **可（PUBLIC 経由）** |
| `get_dormant_users` | `{postgres=X/...}` | 不可 |
| `record_lifecycle_email` | `{postgres=X/...}` | 不可 |
| `get_push_subscriptions_for_user` | `{postgres=X/...}` | 不可 |

3本が閉じているのは migration `20260616000001` の一度きりの `REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC` の効果。`detect_ai_anomalies` は `20260616000003` ＝その後に作られたため漏れた。

是正: `schema.sql` に4関数の `FROM PUBLIC` REVOKE を追加し、本番反映用に `20260803000002` を新設。

> ⚠️ **本REQの範囲を超える残課題**: 同じ理由で、本番で anon から**直接呼べる** SECURITY DEFINER 関数が **43本**ある（トリガ関数を除く。2026-08-03 実測）。`call_lifecycle_edge_function` / `call_send_push` のように **Vault の service_role キーで任意の Edge Function を起動できる**ものも含まれる。多くは本体に admin ゲートを持つが、GRANT 層の防御は効いていない。無条件の一括 REVOKE はブラウザから正当に呼ばれる公開 RPC を壊すため、**別要件として起票して扱う**。

**3. 内容ドリフト検知の CLI に非決定的な偽陽性バグ（実装中に発見・修正済み）**

`scripts/normalize-migration-sql.mjs` の stdin 読み取りが `rawInput += chunk`（チャンクごとに `Buffer.toString()`）だったため、UTF-8 のマルチバイト文字がチャンク境界で分断されると U+FFFD へ化けていた。分断位置は実行ごとに変わるので、**本番の migration がランダムに「内容ドリフトあり」と誤検知**される（実測で `20260615000004` / `20260703000005` が化けた）。本番デプロイをブロックするゲートで偽陽性は許容できないため、`Buffer.concat()` してから1度だけ文字列化する形に修正。**旧実装のコピーで誤検知を再現し、修正版で3回連続 drift 0 になることを実測**したうえで、パイプ経由の回帰テストを追加した。
