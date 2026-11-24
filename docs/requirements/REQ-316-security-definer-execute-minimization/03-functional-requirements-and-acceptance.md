## 機能要件

- **FR-316-01（P0）**: 群Aの12本について、`REVOKE EXECUTE ... FROM PUBLIC`（必要に応じて `FROM anon, authenticated` も）を schema.sql に追加し、本番反映 migration を作る。`call_*` / `run_*` は `service_role` のみ、内部ヘルパー（`extract_request_ip` / `req_is_admin` / `is_current_user_admin` / `_kpi_assert_admin`）はどのクライアントロールにも GRANT しない。
- **FR-316-02（P0）**: `get_ai_cost_summary` の本体を fail-closed に修正する（`IF v_is_admin IS NOT TRUE THEN RAISE ...`）。同型の「`= 'admin'` の結果を `IF NOT` で判定」バグが他関数に無いか全 SECURITY DEFINER 関数を点検する。
- **FR-316-03（P0）**: `call_lifecycle_edge_function` の `p_fn` にホワイトリストを実装する（既知の Edge Function 名のみ許可）。REVOKE で anon を閉じても、DB 内部から誤った名前で呼ばれる経路を塞ぐ多層防御。
- **FR-316-04（P1）**: 群Bの23本に `REVOKE ... FROM PUBLIC` を追加し、`authenticated`（admin 画面用）への明示 GRANT を確定する。
- **FR-316-05（P1）**: `ALTER DEFAULT PRIVILEGES` を根治する。`schema.sql:27` の `IN SCHEMA public` 版を `ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC`（`IN SCHEMA` なし）に置き換え、本番反映 migration を作る。これは**将来作られる関数**にのみ効くため、既存関数の是正（FR-316-01/04）と両輪で行う。
- **FR-316-06（P1）**: `get_audit_logs` の5引数版を本番で `pg_get_functiondef` 採取し、6引数版に統一できることを確認して DROP する（できない場合は理由を記録して閉じるだけに留める）。
- **FR-316-07（P1）**: 群Cの8本は `REVOKE ... FROM PUBLIC` のみ行い anon GRANT を維持する。`resolve_unsubscribe_token` は現行フロントに利用が無いため、外部メールクライアントからの利用が無いことを確認できれば群Aへ移す。
- **FR-316-08（P1）**: pgTAP で「群A/Bは anon EXECUTE 不可、群Cは anon EXECUTE 可、admin 画面関数は authenticated 可」を検証する。REQ-298 の `req298_function_execute_privs.sql` と同じく**テスト自身は REVOKE を打たない**方式にし、schema.sql の REVOKE 行が消えたら落ちるようにする。加えて「承認済みホワイトリスト以外に anon 実行可の SECURITY DEFINER が無い」ことを検査する（Codex 提案のホワイトリスト逸脱クエリ）。

## 受入基準

- **AC-01**: 本番で `has_function_privilege('anon', oid, 'EXECUTE')` が true の SECURITY DEFINER 関数が、**群Cの8本（＋明示的に承認したもの）だけ**になる。群A/Bはすべて false。
- **AC-02**: anon キーで `call_lifecycle_edge_function` / `call_send_push` / `run_weekly_digest_batch` 等を PostgREST 経由で呼ぶと、関数本体に到達せず権限エラーになる。
- **AC-03**: `get_ai_cost_summary` を app_metadata の無い JWT で呼ぶと、データを返さず例外になる（本体修正の検証）。
- **AC-04**: `ALTER DEFAULT PRIVILEGES FOR ROLE postgres` 版を適用した DB に新しい関数を `CREATE FUNCTION` すると、明示 GRANT が無い限り anon は EXECUTE を持たない（既定が閉じている）。
- **AC-05**: 群C（公開ランキング・公開プロフィール・配信停止）が anon で従来どおり成功する。回帰なし。
- **AC-06**: admin 画面（KPI・監査ログ・ユーザー管理）が管理者ログインで従来どおり動く。
- **AC-07**: FR-316-08 の pgTAP が全て通り、schema.sql の該当 REVOKE を1行消すと落ちる。
- **AC-08**: `lint` / `type-check` / 既存テストがパスする。

