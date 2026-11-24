### 問題D: CIの一括GRANTが関数EXECUTEのREVOKEを打ち消し、権限テストが構造的に不能 — Medium

`ci.yml:274` は Supabase 既定の挙動を再現するため、次を実行する。

```
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;
```

これは `supabase/schema.sql` の **14箇所以上の REVOKE**（`:1461, 1477, 1495, 1516, 3143, 3173, 3187, 3224, 3239, 3255, 3296, 3307, 3322, 3464`）を打ち消す。

REQ-282 C-2 で導入された再適用の仕組み（`supabase/ci/reapply-after-grants.txt`）は存在するが、宣言されているのは**列レベル保護の migration 3本のみ**である。

```
20260616000005_fix_reporter_ip_column_protection.sql
20260703000001_location_privacy_disclosure.sql
20260703000002_research_data_integrity_insert_protection.sql
```

関数 EXECUTE の REVOKE は再適用対象に入っていない。加えて pgTAP テスト（`supabase/tests/`）に **`function_privs_are` / `has_function_privilege` の assertion は0件**である。

したがって:

- `get_dormant_users` / `record_lifecycle_email` / `get_push_subscriptions_for_user` / `detect_ai_anomalies` 等の「anon から実行不可」が **CIで一度も検証されていない**
- CI は**本番と逆の権限状態**（anon が全 SECURITY DEFINER 関数を実行できる状態）で全テストを通している
- schema.sql の REVOKE 行を誤って削除しても、CIは緑のまま

### 問題E: pg_net webhookラッパ7本がCIで一度も実行されない — Medium

`supabase/migrations/20260717000001_webhook_secret_headers.sql:25-26` が説明するとおり、以下7本は `vault` / `pg_net` を前提とするため **`supabase/schema.sql` に掲載されていない**（`schema.sql:3000, 3025, 3261` 付近が該当箇所の境界）。

| ラッパ | 役割 |
|---|---|
| `private.edge_webhook_headers` | `x-webhook-secret` ヘッダ生成（REQ-270 の中核） |
| `call_lifecycle_edge_function` | ライフサイクルメール3本の起動 |
| `call_notify_survey_request` | 調査依頼通知の起動 |
| `call_send_push` | Web Push の起動 |
| `run_ai_anomaly_check` | AI異常検知 cron |
| `private.call_ai_edge_function` | AI解析（analyze-image 等）の起動 |
| `private.trigger_enrich_place` | 逆ジオコーディングの起動 |

これらは**通知・AI解析・Web Push・逆ジオの起動経路そのもの**である。`rls-tests` ジョブは `ci.yml:266` で `schema.sql` のみを適用するため（REQ-282 の判断）、7本のカバレッジは **0** である。

さらに全ラッパが `EXCEPTION WHEN OTHERS THEN NULL` の fail-soft 設計（REQ-234 NFR-234-01 で意図されたもの）であるため、壊れても無言である。REQ-270 と同型の事故（secret ヘッダが載らない／関数名が違う）が再発しても、**CIも既存アラートも検知できない**。問題Bにより migration drift も内容を見ないため、**二重の盲点**になっている。

なお `supabase/ci/storage_stub.sql` という「CIに存在しないスキーマをスタブして migration を実適用する」前例が既にある（`ci.yml` の storage RLS ステップ）。同じ方式が vault / pg_net に適用できる。

### 問題F: CIのPostgreSQLバージョンが宣言と不一致 — Low

`supabase/config.toml:22` は `major_version = 17` を宣言しているが、`ci.yml:234`（`FROM postgres:16` の pgTAP イメージ）と `:307`（`image: postgres:16` の schema-drift サービス）は **PG16** である。

したがって RLS・列権限・トリガー検証の2ジョブが本番と異なるメジャーバージョンで走る。「CIは緑だが本番では別挙動」のリスクを構造的に抱える（REQ-279 で扱った RLS initplan の最適化はバージョン依存の話題である）。

### 問題G: `supabase/config.toml` が存在しない `seed.sql` を参照 — Low

`supabase/config.toml:29-30`:

```toml
[db.seed]
enabled = true
sql_paths = ["./seed.sql"]
```

`supabase/seed.sql` は**存在しない**（実測）。`supabase db reset` / `supabase start` がシード段階で失敗または警告を出す。REQ-282 で確認済みの「ローカル一発再構築ができない」状況を補強している。
