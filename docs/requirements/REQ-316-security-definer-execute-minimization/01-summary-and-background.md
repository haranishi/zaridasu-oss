## 0. 要件サマリー

REQ-298 の実装中（2026-08-03）に、**本番で anon ロールから PUBLIC 経由で直接実行できてしまう SECURITY DEFINER 関数が43本**あることが判明した（トリガ関数を除く。`has_function_privilege('anon', oid, 'EXECUTE')` で実測）。

原因は2つが重なっている。

1. **`schema.sql:27` の `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC` が no-op**。PostgreSQL 16 で実測すると `pg_default_acl` に行が作られず、以降に作った関数は PUBLIC が EXECUTE を持つ既定のまま。個々の `REVOKE ... FROM anon` は**直接付与しか剥がさない**ため、PUBLIC 経由の実行が残る。
2. その結果、`REVOKE ... FROM PUBLIC` を明示していない関数はすべて anon に開いている。

REQ-298 では要件が指定した4関数だけを是正した（`20260803000002`）。本REQは**残る全関数を体系的に最小権限化**し、no-op だった既定権限設定を**根治**する。

最も危険なのは `call_lifecycle_edge_function` 系で、**anon が Vault の service_role キーと webhook secret を付けて任意の Edge Function を起動できる**。さらに `get_ai_cost_summary` には認可判定そのもののバグ（後述）があり、**REVOKE だけでは塞がらない**。

## 背景

### 発見の経緯と実測

- 2026-08-03、REQ-298 FR-298-06 の実装中に、`schema.sql` の `ALTER DEFAULT PRIVILEGES` が期待どおり動いていないことに気づいた。
- 本番 DB を実測（`pg_proc.proacl` / `has_function_privilege`）した結果:
  - 本番で anon から実行可能な SECURITY DEFINER 関数（非トリガ）: **43本**
  - 本番の public スキーマ関数の所有者: **全96本が `postgres`**
- ローカル PostgreSQL 16 で `ALTER DEFAULT PRIVILEGES` の挙動を実測（本REQ検証②）:
  - `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC` → **効かない**（`pg_default_acl` に行が作られず、直後の関数は anon 実行可）
  - `ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC`（`IN SCHEMA` を付けない）→ **効く**（`pg_default_acl` に行ができ、直後の関数は anon 実行不可）

### なぜ `IN SCHEMA public` 版が効かないのか

PostgreSQL の関数は作成時に**組み込みのグローバル既定**で PUBLIC に EXECUTE が付く。`ALTER DEFAULT PRIVILEGES` は「**将来オブジェクトを作成するロールごと**」に既定を調整する仕組みで、`IN SCHEMA` を付けるとスキーマ別の追加設定になり、グローバル既定の PUBLIC EXECUTE を打ち消せない。`FOR ROLE <作成ロール>` を指定し `IN SCHEMA` を付けないことで、そのロールが作る関数のグローバル既定から PUBLIC EXECUTE を除去できる。本番は全関数が `postgres` 所有なので `FOR ROLE postgres` が正しい。

### 認可判定バグ: `get_ai_cost_summary`（REVOKE では直らない）

本番の関数定義（`pg_get_functiondef` で採取）:

```sql
v_is_admin := (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin';
IF NOT v_is_admin THEN
  RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
END IF;
```

`app_metadata` を持たない JWT（＝anon）では `(NULL) = 'admin'` が **NULL** になり、`IF NOT NULL` は THEN 節を実行しない（三値論理）。結果、**例外が飛ばずデータを返す**。実測（本REQ検証①）:

| claims | 結果 |
|---|---|
| `{"role":"anon"}`（app_metadata なし） | **PASSED（データを返す）** |
| `{"role":"authenticated","app_metadata":{"role":"user"}}` | BLOCKED（例外） |
| `{"app_metadata":{"role":"admin"}}` | PASSED |

**anon はすり抜けるが、ログイン済み一般ユーザーは弾かれる**という歪んだ挙動。`get_ai_cost_summary` は AI 呼び出し数・モデル別トークン量・日次コストを返すため、運用メトリクスが anon に漏れ、巨大な `p_days` で重い集計 DoS も誘発できる。**PUBLIC REVOKE に加えて本体を fail-closed（`IF v_is_admin IS NOT TRUE THEN` 等）に直す必要がある**。同型の判定が他の関数に無いかも点検する。

### 関数定義の乖離: `get_audit_logs` の孤児オーバーロード

本番には `get_audit_logs` が**2つのオーバーロード**（5引数版と6引数版）が存在し、両方 anon 実行可。リポジトリ（`schema.sql`・全62 migration・git 履歴）には**6引数版しか無い**。5引数版は本番に残存した孤児で、本体ゲートの有無をリポジトリから確認できない。

これは REQ-298 の内容ドリフト検知（`statements` のハッシュ突合）では**捕まらない種類の乖離**である（migration の適用履歴ではなく、関数の実体が本番だけに存在する）。PostgREST のオーバーロード解決が5引数版に流れる可能性もあるため、**本番で `pg_get_functiondef` を採取して定義を確認し、6引数版に統一できるなら DROP する**。

