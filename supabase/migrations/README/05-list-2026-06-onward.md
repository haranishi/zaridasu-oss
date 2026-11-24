### 卒研・実験/多様性/構造化調査（2026-06）

| ファイル | 日付 | 目的 | 対応REQ | 本番 |
|---|---|---|---|---|
| `20260603000001_add_posts_accuracy.sql` | 2026-06-03 | posts に GPS 水平精度 `accuracy` 追加（SDM の最低要件 30m）＋`protect_post_status()` 再定義 | REQ-172 | ✅ |
| `20260603000002_experiments.sql` | 2026-06-03 | 介入評価・実験計測基盤（フィーチャーフラグ＋安定割付＋群×期間集計）。卒研 H2 検証 | REQ-175 | ✅ |
| `20260603000003_user_diversity.sql` | 2026-06-03 | 「発見の多様性」集計 RPC `get_user_diversity()`（投稿数競争の代替指標） | REQ-171 | ✅ |
| `20260603000004_undersurveyed_areas.sql` | 2026-06-03 | 空間バイアス補正ナッジ用 RPC `get_undersurveyed_areas()`（直近 N 日の市区町村別件数） | REQ-173 | ✅ |
| `20260603000005_structured_survey.sql` | 2026-06-03 | 定点観察（structured）/機会記録（opportunistic）の並立設計（`survey_sites` 新設＋ posts 列追加） | REQ-174 | ✅ |
| `20260603000006_seed_experiments.sql` | 2026-06-03 | A/B 実験定義（`ai_feedback` / `new_ranking`）を冪等にシード投入 | REQ-175 / REQ-170 / REQ-171 | ✅ |

### セキュリティ・リテンション・本番ハードニング（2026-06-15〜16）

| ファイル | 日付 | 目的 | 対応REQ | 本番 |
|---|---|---|---|---|
| `20260615000001_revoke_reporter_ip_select.sql` | 2026-06-15 | `posts.reporter_ip`（PII）の列レベル REVOKE ＋未使用 `posts_public` ビュー廃止。**※列単位 REVOKE は no-op と後に判明し `…000005` で是正** | REQ-179 / REQ-025 | ✅ |
| `20260615000002_protect_survey_request_columns.sql` | 2026-06-15 | survey_requests に列固定 BEFORE UPDATE トリガー（所有者による集計値/不変項目の改竄防止） | REQ-208 | ✅ |
| `20260615000003_research_kpi_rpcs.sql` | 2026-06-15 | 卒研 KPI ダッシュボード用 admin 限定・読取専用集計 RPC 3 本（NSM/コホート継続率/承認ファネル） | REQ-233 | ✅ |
| `20260615000004_reverse_geocoding_place_enrichment.sql` | 2026-06-15 | 逆ジオコーディングで地名/水系/水辺/標高を付与する基盤（`geo_cache`＋ enrich-place トリガー） | REQ-231 | ✅ |
| `20260615000005_quality_gamification.sql` | 2026-06-15 | 質（検証済み投稿・同定精度）を称える品質バッジ 4 種＋品質連動ランキング RPC（Goodhart 対策） | REQ-235 | ✅ |
| `20260615000006_lifecycle_notifications.sql` | 2026-06-16※ | 研究採用通知＋ Resend ライフサイクルメール（休眠復帰/週次ダイジェスト）基盤＋ pg_cron | REQ-234 | ✅ |
| `20260615000007_web_push_subscriptions.sql` | 2026-06-15 | Web Push 通知の DB 基盤（`push_subscriptions`＋ service_role 専用 RPC＋ call_send_push） | REQ-237 | ✅ |
| `20260616000001_supabase_hardening.sql` | 2026-06-16 | Supabase 本番ハードニング（最小権限/search_path 固定/security_invoker 統一）＋`set_user_admin_role` 権限昇格バグ修正 | REQ-221 / REQ-214 | ✅ |
| `20260616000002_public_endpoint_rate_limit.sql` | 2026-06-16 | 公開エンドポイント（通報/コメント/いいね）に DB トリガー層のレート制限（検閲攻撃対策含む） | REQ-212 / REQ-221 | ✅ |
| `20260616000003_ai_anomaly_detection.sql` | 2026-06-16 | AI 自動承認/却下の濫用・暴走を pg_cron 集計で検知し管理者通知（`detect_ai_anomalies()`） | REQ-215 | ✅ |
| `20260616000004_grant_hardening.sql` | 2026-06-16 | 内部専用テーブル 4 件から anon/authenticated の不要 GRANT を live DB で剥奪（最小権限確定） | REQ-221 | ✅ |
| `20260616000005_fix_reporter_ip_column_protection.sql` | 2026-06-16 | **`…000001` の列単位 REVERT が no-op だった是正**。テーブル SELECT を REVOKE し `reporter_ip` 以外の全列を動的に GRANT し直す | REQ-179 / REQ-208 | ✅ |
| `20260703000001_location_privacy_disclosure.sql` | 2026-07-03 | 位置情報プライバシー: 生 `lat`/`lng`/`accuracy` の列 GRANT 剥奪＋公開用粗化列 `display_*`＋公開レベル（`location_disclosure`）トリガー/RPC | REQ-243 | ✅ |
| `20260703000002_research_data_integrity_insert_protection.sql` | 2026-07-03 | `protect_post_insert_columns` 再定義: サーバ付与の地理メタデータ列を INSERT 時 NULL 固定・municipality 許可リスト正規化（20260703000001 の後に適用必須） | REQ-244 | ✅ |
| `20260703000003_req241_authz_enumeration_hardening.sql` | 2026-07-03 | RPC 認可ゲート欠落・メール列挙・スキーマドリフトの是正（追補） | REQ-241 | ✅ |
| `20260703000004_contribution_level_xp_engine.sql` | 2026-07-03 | 貢献レベル/XP エンジン（品質連動・DB 権威・`get_user_progress` 等） | REQ-248 | ✅ |
| `20260703000005_crayfish_collection_dex_aquarium.sql` | 2026-07-03 | ザリガニ・コレクション/図鑑/水槽（`user_collection`・`get_user_collection`） | REQ-250 | ✅ |
| `20260708000001_ai_accuracy_stats.sql` | 2026-07-08 | AI 判定の信頼性エビデンス化（精度統計 RPC） | REQ-253 | ✅ |
| `20260717000001_webhook_secret_headers.sql` | 2026-07-17 | pg_net 送出側に `x-webhook-secret` 付与（`private.edge_webhook_headers` ヘルパー新設＋全ラッパ6本再定義。Vault `webhook_secret` 未登録なら従来動作） | REQ-270 | ✅ |
| `20260728000001_drop_legacy_analyze_image_webhook.sql` | 2026-07-28 | ダッシュボード由来の旧 Webhook トリガー `analyze-image-on-insert` を削除し、リポジトリ管理下の `analyze_image_on_insert` 経路へ一本化（Edge Function の二重起動を解消・トリガー定義に埋め込まれていた service_role JWT を除去）。**schema.sql の同期は不要**（削除対象は Supabase ダッシュボードで作られたリポジトリ管理外オブジェクトであり、schema.sql に存在しないため） | REQ-286 / REQ-287 | ✅ |
| `20260730000001_req292_authz_defects_anon_granted_rpc.sql` | 2026-07-30 | anon GRANT された SECURITY DEFINER 関数 3 本の認可欠陥を修復。`admin_login_record` / `admin_login_check` / `check_email_exists` から anon の EXECUTE を剥奪し、本体に fail-closed ゲート（`_req292_is_server_caller()`）を追加。`login_success` は `auth.uid()` 実在＋メール一致必須（admin_id NULL の成功行を作れない）、失敗記録はサーバー側専用（audit_logs への anon 注入を封じる）。Password Verification Attempt Hook 用 `admin_login_password_attempt(jsonb)` を新設（`/auth/v1/token` 直叩きも記録・常に decision=continue・fail-open。**有効化は Dashboard / config.toml 側の操作が必要**）。回帰テスト `supabase/tests/req292_anon_granted_rpc_authz.sql`（27 アサーション） | REQ-292 | ✅ 適用済み |
| `20260803000001_req298_realign_protect_official_flag.sql` | 2026-08-03 | `protect_official_flag()` を schema.sql（REQ-208 版）へ本番も追随させる。**適用済み migration `20260513000014` のファイルが後から書き換えられ、本番だけ REQ-208 前の旧定義で動いていた**（2026-08-03 に `pg_get_functiondef()` で実測確認）。CI は schema.sql を適用するため新挙動をテストしており、本番との乖離を誰も検知していなかった＝REQ-298「問題B (c)」の実例。以後この型は `scripts/check-migration-drift.sh` の内容ドリフト検知が捕まえる | REQ-298 / REQ-208 | ✅ 適用済み |
| `20260803000002_req298_revoke_function_execute_from_public.sql` | 2026-08-03 | SECURITY DEFINER 関数 4 本の EXECUTE を **PUBLIC からも** 剥がす。schema.sql 冒頭の `ALTER DEFAULT PRIVILEGES ... REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC` が **no-op** で（pg_default_acl に行が作られない・PG16 で実測）、`FROM anon` だけでは PUBLIC 経由の実行が残っていた。本番実測で `detect_ai_anomalies` が anon から実行可能な状態だった（20260616000001 の一括 REVOKE より後に作成されたため漏れた） | REQ-298 | ✅ 適用済み |

| `20260908000001_req325_user_onboarding.sql` | 2026-09-08 | 本人専用の回答テーブル・RLS・更新日時トリガー | REQ-325 | ✅ 適用済み |
| `20260926000001_req329_owner_location_privacy_private_spots.sql` | 2026-09-26 | 投稿者が位置を非公開（hidden）にできる（INSERT/UPDATE とも一方向・`protect_post_insert_columns` / `protect_post_status` 再定義）＋ hidden の投稿の字名・水系名を管理者専用 `post_hidden_geo` へ退避（既存 hidden 分も退避）＋名前付きの非公開スポット `private_spots`（本人と管理者だけ・1 時間 60 件上限）。**reapply-after-grants.txt で 20260703000002 の後に再適用** | REQ-329 | ✅ 適用済み |
| `20260926175847_req316_notification_rpc_and_admin_guard.sql` | 2026-09-27 | 内部通知 RPC 7 本（`call_*`・`run_*`）の anon / authenticated からの実行を拒否し service_role に限定・`call_lifecycle_edge_function` の呼び先を 3 関数に限定・`get_ai_cost_summary` の管理者判定を NULL でも拒否する形へ。**CI の rls-tests は旧 webhook 定義の後にこの migration を当てる**（ci.yml） | REQ-316（一部） | ✅ 適用済み（2026-10-03） |
| `20261001000001_req330_fieldwork.sql` | 2026-10-01 | 本人と管理者だけが読める調査計画・地点・投稿との関連・希少種の記録の4表、非公開の写真置き場、並べ替えRPC。**既定GRANTの後にも再適用** | REQ-330 | ✅ 適用済み（2026-10-03） |
| `20261008100350_water_discovery_reports.sql` | 2026-10-08 | 写真付き水域の情報提供、本人・管理者限定の報告と写真、管理者審査後の名前・粗化位置だけを公開する投影、審査RPC・監査ログ・再送重複防止。既定GRANT後にも再適用 | 水域発見・調査計画 | ✅ 適用済み（2026-10-09） |
| `20261021120000_req316_function_execute_default_closed.sql` | 2026-10-21 | SECURITY DEFINER 関数の EXECUTE を既定で閉じる（REQ-316 の完了）。内部専用11本は service_role のみ、管理者・本人用は匿名と PUBLIC から外し、公開が仕様の9本だけ匿名に残す。これから作る関数も明示の GRANT が無ければ閉じる（`ALTER DEFAULT PRIVILEGES FOR ROLE postgres`）。公開が仕様の関数が閉じたら migration ごと失敗する安全装置つき。**既定 GRANT の後・最後に再適用** | REQ-316 / security-hardening 要件1 | ⏳ 未適用 |
| `20261021120100_fix_private_profile_rpc_null_owner.sql` | 2026-10-21 | `get_user_progress` / `get_user_collection` が、未ログイン（auth.uid() が NULL）のとき非公開プロフィールの進捗・図鑑を返していた不具合（`IF NOT v_is_owner` が NULL で素通り）を、NULL を「本人ではない」に畳んで修正 | security-hardening 要件2 | ⏳ 未適用 |
| `20261021120200_pin_created_at_on_client_write.sql` | 2026-10-21 | 一般ユーザーの INSERT で `created_at` を受付時刻に固定し UPDATE では旧値に戻す（9表）。過去の日時を付けて回数制限（投稿は24時間5件など）を回避できた不具合の修正 | security-hardening 要件3 | ⏳ 未適用 |
| `20261021120300_hide_unsubscribe_token_column.sql` | 2026-10-21 | `user_profiles.unsubscribe_token` を匿名・ログイン済みから読めなくする（列単位の SELECT）。公開プロフィールから読んだトークンで他人の通知を止められた。**既定GRANT後にも再適用** | security-hardening 要件4 | ⏳ 未適用 |
| `20261021120400_account_deletion_fixes.sql` | 2026-10-21 | 投稿のある会員が退会できなかった不具合（`protect_post_status` が退会時の `user_id` NULL 化を戻していた）と、監査ログの外部キー（`ON DELETE SET NULL`）の修正。**既定GRANT後にも再適用（`20260926000001` の後）** | security-hardening 要件5 | ⏳ 未適用 |
| `20261021120500_protect_post_insert_ops_columns.sql` | 2026-10-21 | 新規投稿で研究採用日時・採用通知日時・AI失敗回数を申告できないよう、`protect_post_insert_columns` に3列の初期化を追加。**既定GRANT後にも再適用（`20260926000001` の後）** | security-hardening 要件6 | ⏳ 未適用 |
| `20261021120600_comment_notification_claims.sql` | 2026-10-21 | コメント通知メールの送信済みの印 `comment_notification_claims`（サーバー専用）。同じコメントIDで何度もメールを送れた不具合の修正に使う | security-hardening 要件9 | ⏳ 未適用 |

---
