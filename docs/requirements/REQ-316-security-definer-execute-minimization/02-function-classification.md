## 分類（Codex 静的解析 + 親の実測、2026-08-03）

43本を「本体ゲートの有無」「フロントの `.rpc()` 呼び出し」「想定呼び出し元」で3群に分類した。**群Cの仕分けが最重要**（誤って REVOKE するとアプリが壊れる）。

### 群A — anon 公開を閉じる。実害寄り（12本）

| 関数 | 本体ゲート | 危険度 | 要点 |
|---|---|---|---|
| `call_lifecycle_edge_function(text, jsonb)` | **なし** | 🔴最優先 | anon が任意の Edge Function 名を指定し、Vault の service_role キー＋webhook secret 付きで起動できる。`p_fn` のホワイトリスト無し |
| `call_send_push(jsonb)` | **なし** | 🔴最優先 | 任意ユーザーへ任意タイトル・本文・URL の Push。フィッシング・スパム |
| `call_notify_survey_request(jsonb)` | **なし** | 🔴最優先 | 実在 request_id で地域一斉メールを再送起動。送信イベントの一意性チェック無し |
| `run_dormant_reengage_batch()` | **なし** | 🔴最優先 | 全休眠ユーザーへの再訪メールバッチを任意起動 |
| `run_weekly_digest_batch()` | **なし** | 🔴最優先 | 週次ダイジェスト（最大500人）を任意起動 |
| `get_ai_cost_summary(integer)` | **壊れている**（上記バグ） | 🔴最優先 | anon がすり抜けて AI コスト集計取得。**本体修正必須** |
| `run_ai_anomaly_check()` | なし | 🟡高 | 管理者向け AI 異常検知を任意起動。集計・通知・外部API負荷 |
| `call_notify_research_adopted(jsonb)` | なし | 🟡高 | 任意 post_id で採用通知を起動（Edge 側に採用済みチェックあり） |
| `extract_request_ip()` | なし | ⚪低 | 返るのは呼び出し元自身の IP。公開不要な内部ヘルパー |
| `is_current_user_admin()` | なし（anon には false） | ⚪低 | 唯一の利用元 `posts_public` は廃止済み。デッドコード |
| `req_is_admin()` | なし（anon には false） | ⚪低 | レート制限トリガーの内部ヘルパー。公開不要 |
| `get_audit_logs(...5引数版)` | **確認不能** | ⚪保守 | 孤児オーバーロード。まず閉じ、本番で定義採取して DROP 可否判断 |

### 群B — 本体ゲートで守られている。二層目として閉じる（23本）

`REVOKE ... FROM PUBLIC, anon;` ＋ `GRANT ... TO authenticated;` が基本形。本体に admin/所有者/service_role ゲートがあり即時実害は無いが、REQ-241 が意図した「GRANT 層でも閉じる」二層防御が欠けている。

主なもの: `_kpi_assert_admin` / `admin_login_check` / `admin_login_record` / `check_email_exists` / `delete_own_account` / `detect_ai_anomalies`（REQ-298 で是正済み）/ `get_admin_post_locations` / `get_admin_user_list` / `get_ai_accuracy_stats` / `get_audit_logs`（6引数版）/ `get_experiment_metrics` / `get_kpi_quality_funnel` / `get_kpi_summary` / `get_my_experiment_variants` / `get_my_post_location` / `get_retention_cohorts` / `get_user_activity` / `recompute_all_collections` / `recompute_all_progress` / `set_post_location_disclosure` / `set_species_location_default` / `set_user_admin_role` / `soft_delete_request_comment`

> ⚠️ Codex は「本番では PUBLIC 経由で開いているのに、schema.sql には既に PUBLIC REVOKE がある関数がある」（`admin_login_check` / `check_email_exists` / `detect_ai_anomalies` 等）と指摘した。これは REQ-292 / REQ-298 の migration が**本番未適用**なため（本REQ着手時点で3本が未 push）。実装時に本番適用状況と突合すること。

### 群C — anon 公開が仕様。触らない（8本）

`REVOKE ... FROM PUBLIC;` ＋ `GRANT ... TO anon, authenticated;`（PUBLIC は剥がすが anon への直接付与は残す）。**一括 REVOKE の除外対象**。

| 関数 | 公開理由 |
|---|---|
| `get_user_profile(uuid)` | 公開プロフィール `/profile/[userId]`（未ログイン閲覧） |
| `get_user_ranking(integer,integer,text)` | 公開 `/ranking` |
| `get_user_diversity(integer,integer)` | 公開 `/ranking` |
| `get_user_quality(integer,integer)` | 公開 `/ranking` |
| `get_user_progress(uuid)` | 公開プロフィール（`is_public` 準拠） |
| `get_user_collection(uuid)` | 公開プロフィール（`is_public` 準拠） |
| `apply_unsubscribe(uuid,text)` | 未ログインの配信停止ページ（トークンを capability として認可） |
| `resolve_unsubscribe_token(uuid)` | 同上（ただし現行フロントに直接利用が無い＝要確認） |

