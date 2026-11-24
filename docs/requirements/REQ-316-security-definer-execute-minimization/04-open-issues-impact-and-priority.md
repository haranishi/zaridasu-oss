## 未確定事項（実装着手前に決める）

| # | 論点 | 選択肢 | 決定 |
|---|---|---|---|
| 1 | 最終ゴールの定義 | A. anon 実行可の SECURITY DEFINER を**0本**にする（群Cを SECURITY INVOKER + RLS へ再設計）/ B. **承認済みホワイトリスト8本のみ**許容する | 未定（Bが小さい。Aは公開プロフィール/ランキングの再設計を伴う） |
| 2 | 是正の適用方式 | A. `REVOKE EXECUTE ON ALL FUNCTIONS ... FROM PUBLIC, anon, authenticated` の一括初期化＋ホワイトリスト再GRANT / B. 関数ごとの個別 REVOKE | 未定（Aは確実だが migration 専用関数が schema.sql に無い問題に当たる。Bは漏れやすいが安全） |
| 3 | 群Cの公開範囲の妥当性 | `get_user_quality` は未承認投稿を含む総数・承認率を返す。`get_user_collection` は活動市区町村を返す。公開仕様として妥当か | 未定（プロダクト判断） |
| 4 | `resolve_unsubscribe_token` の扱い | A. 群Cに残す / B. 外部利用が無いと確認して群Aへ | 未定（本番 PostgREST ログで実利用確認が前提） |
| 5 | migration 専用関数の権限を schema.sql でどう表現するか | `call_*` / `run_*` / `get_ai_cost_summary` 等は schema.sql に定義が無い。存在しない関数への REVOKE は schema.sql 単独適用を壊す | 未定（schema.sql に定義を足すか、権限だけ別ファイルにするか） |

## 要確認（本番で採取してから実装）

- **43本の完全なシグネチャ・所有者・`proacl`・`pg_get_functiondef`** を本番から退避する。特に5引数版 `get_audit_logs`。
- **本番 Vault に `edge_function_service_role_key` / `webhook_secret` が実在するか**。実在するなら群Aの `call_*` / `run_*` は「anon が実際に発火できる」＝Critical。無ければ現時点は fail-soft で握り潰されるが、REQ-291（webhook secret の本番有効化）が進むと発火するようになるため、いずれにせよ閉じる。
- **`p_fn='../...'` による同一オリジン内パストラバーサル**が pg_net / Supabase ゲートウェイの URL 正規化で起きないか（ステージング実測）。固定プレフィックスがあるので任意外部ホスト SSRF ではないが、同一オリジン別パスへの到達余地は未確認。
- **全 `src/**/.rpc()` 呼び出しの網羅リスト**と43本以外も含めた突合（一括 REVOKE 方式を採る場合は必須）。動的に組み立てた RPC 名は静的解析で拾えない。
- **REQ-292 / REQ-298 の未適用 migration の本番適用状況**（群Bの一部は「schema.sql に REVOKE があるのに本番は開いている」＝適用漏れ）。

## 影響範囲

- `supabase/schema.sql` — `:27` の ALTER DEFAULT PRIVILEGES 置換、群A/B/C の REVOKE/GRANT 追加、`get_ai_cost_summary` 本体修正、`call_lifecycle_edge_function` のホワイトリスト
- `supabase/migrations/` — 本番反映 migration（権限是正・本体修正・ALTER DEFAULT PRIVILEGES・get_audit_logs 統一で複数本）
- `supabase/tests/` — FR-316-08 の pgTAP
- REQ-298 の `check-migration-drift.sh` の内容ドリフト検知が、これらの新規 migration を突合対象にする（追加作業なし）

## 他要件との関係

- **REQ-298**: 本REQは REQ-298 の実装中に発見された欠陥の受け皿。REQ-298 は対象4本のみ是正し、残りを本REQへ切り出した。
- **REQ-292**: anon GRANT された RPC の認可欠陥と同型。REQ-292 は5関数を `FROM PUBLIC` と `FROM anon` の2行セットで正しく閉じており、その方式を全関数へ広げるのが本REQ。
- **REQ-291**: webhook secret の本番有効化。これが進むと群Aの `call_*` が「実際に発火する」ようになるため、本REQは REQ-291 の前提として先行させるのが望ましい。
- **REQ-241**: 「GRANT 層でも閉じる」二層防御の思想。群Bはこれの未完部分。

## 優先度の内訳

| 要件 | 優先度 | 理由 |
|---|---|---|
| FR-316-01（群A の REVOKE） | **P0** | anon が service_role キーで Edge Function を起動できる |
| FR-316-02（get_ai_cost_summary 本体修正） | **P0** | REVOKE では塞がらない認可バイパス |
| FR-316-03（call_lifecycle のホワイトリスト） | P0 | 多層防御。DB 内部からの誤用も塞ぐ |
| FR-316-05（ALTER DEFAULT PRIVILEGES 根治） | P1 | 将来の関数漏れを止める。既存是正と両輪 |
| FR-316-04 / 06 / 07 / 08 | P1 | 二層防御の完成・孤児関数整理・検証 |

## security-hardening での決定（2026-10-21）

- 未確定事項 1（最終ゴール）：**B（承認済みの許可リストだけ）**。匿名で実行できる SECURITY DEFINER 関数は 9 本（群C の8本＋未ログインで空を返す `get_my_experiment_variants`）。
- 未確定事項 2（適用方式）：**関数ごとの明示（内部専用・管理者本人用・公開）＋最後の掃き出し**。掃き出しは、リストに載せていない関数の PUBLIC と anon を外し、ログイン済みは現状維持。
- 未確定事項 4（`resolve_unsubscribe_token`）：現行の画面は使っていないが、外部利用の有無を確かめられないため、群Cに残した。
- 未確定事項 5（migration 専用関数の権限）：migration `20261021120000` が確定し、CI は一括 GRANT の後に最後に当て直す。許可リストは `supabase/tests/req316_function_execute_default_closed.sql`。
- FR-316-05（既定の権限）：`ALTER DEFAULT PRIVILEGES FOR ROLE postgres`。`schema.sql` はファイル末尾に置く（先頭だと CI が本番より閉じて見えるため）。
- FR-316-06（`get_audit_logs` の孤児）：5引数版が存在すれば、6引数版と同じ扱いで PUBLIC と anon を閉じる。DROP は、本番で定義を採取してから本人が判断する。
- 要確認のうち、本番での採取（43本の ACL・Vault の鍵・`p_fn='../'` の実測）は、今回も未実施。
