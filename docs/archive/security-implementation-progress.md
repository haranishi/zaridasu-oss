> ⚠️ **アーカイブ（2026-07-18 / REQ-282 FR-282-B3）**: 進捗トラッカーとしての更新を終了。REQ の現況は `docs/requirements/` の各インデックスが正。

# セキュリティ要件 REQ-210〜221 実装記録（2026-06-16）

Obsidian `Security_Research` 由来のセキュリティ要件12件（REQ-210〜221）を、ファイルが互いに素な単位で **4ウェーブの並列エージェント**実装。前セッションの REQ-176〜209/222〜237（対象外だった REQ-210〜221）の続き。

## ✅ 完了サマリー

**全12件 実装完了。最終チェックポイント全 green。**
- type-check ✓ / lint(`--max-warnings 0`) ✓ / i18n:check ✓(1120キー・ja/en/ko/zh パリティ) / schema:check ✓ / test ✓(44 files・**407 passed・0 error**) / build ✓(完走)
- **git: 未コミット**（ユーザー指示により add/commit/push なし）
- DB migration 新規2本: `20260616000001_supabase_hardening.sql`(REQ-221) / `20260616000002_public_endpoint_rate_limit.sql`(REQ-212)

## ウェーブ計画と実装内容

| Wave | REQ | 概要 | 主な成果物 |
|---|---|---|---|
| 1 | 210 | CI供給チェーン防御 | `.github/dependabot.yml` / `CODEOWNERS` / `.gitleaks.toml` / `codeql.yml` / ci.yml(Actions SHA固定・最小permissions・audit/gitleaks/dependency-reviewジョブ) / `SECURITY_SETUP.md` |
| 1 | 211 | Sentry PIIスクラブ | `src/lib/sentryScrub.ts`(+test22) / sentry.server・edge.config / instrumentation-client(3段スクラブ) / notify-* ログmaskEmail / aiLogging redact拡張 / `docs/security/sentry-data-scrubbing.md` |
| 1 | 214 | サーバー認可getUser監査 | eslint no-restricted-syntax / check-no-auth-route.mjs拡張 / middlewareコメント是正 / pgTAP `rls_set_user_admin_role.sql` / `docs/security/server-auth-audit.md` |
| 1 | 216 | セキュリティヘッダ補強 | next.config: poweredByHeader:false / COOP same-origin / CORP same-site / Permissions-Policy拡充 |
| 1 | 220 | インシデントrunbook | `docs/runbooks/incident/` 8本(README/secret漏洩/乗っ取り/課金異常/個人データ漏洩/障害/証拠保全/連絡先) |
| 2 | 213 | zod入力検証統一 | `src/lib/validation/schemas.ts`(+test57) / 各hooks・ReportModal・CommentSection / constants / translation(validation namespace) ／ **reason 500→300 ドリフト解消** |
| 2 | 215 | AI/LLMセキュリティ | `_shared/aiSchema.ts`(受信後検証・**is_appropriate明示trueのみ自動承認=フェイルセーフ**) / analyze-image・audio(出力検証・claimedSpecies無害化・reanalysisはDB再取得・送信前サイズ上限) / types/post.ts(AIConcern enum) / DetailPage(notes owner限定) |
| 2 | 217 | バックアップ/BCP | `.github/workflows/backup.yml` / scripts/backup-db・storage・restore-db・restore-storage.sh(age/gpg暗号・DRY_RUN) / `docs/runbooks/backup-restore.md` |
| 2 | 221 | Supabase本番ハードニング | schema.sql(REVOKE CREATE/ALTER DEFAULT PRIVILEGES/search_path固定×2/security_invoker) + migration / config.toml(schemas最小化) / `docs/runbooks/supabase-hardening-checklist.md` ／ **★set_user_admin_role 権限昇格バグ修正** |
| 3 | 212 | bot/レート制限/CAPTCHA | schema.sql+migration(reports/comments/likesレート制限トリガ・pgTAP7) / AuthModal(Turnstile・未設定時fail-open) / next.config CSP(challenges.cloudflare.com) / middleware軽量エッジ制限 / `docs/security/captcha-setup.md` ／ **外部npm依存(@upstash)は不採用＝DBトリガ方式** |
| 3 | 218 | クラウド課金ガードレール | `_shared/aiKillSwitch.ts`(AI_ANALYSIS_ENABLED) / `aiRetryConfig.ts`(指数バックオフ+全体タイムアウト) / analyze-image・audio堅牢化 / `docs/runbooks/cloud-cost-guardrails.md` |
| 4 | 219 | メール認証SPF/DKIM/DMARC | notify-* 7関数のFromを `NOTIFY_FROM_EMAIL` 統一 / config.toml SMTP方針 / `docs/runbooks/email-authentication.md` |

## ★重要バグ修正（実装中に発見）

**`set_user_admin_role` 権限昇格バグ**（REQ-214 監査で発見 → REQ-221 で修正）
- 旧: `IF caller_role != 'admin'` … 呼び出し元の `raw_app_meta_data` に role キーが無く `caller_role` が NULL（role未設定の一般ユーザー / admin剥奪後のユーザー）の場合、`NULL != 'admin'` が NULL=偽となり例外が発火せず、**一般ユーザーが他者を admin に昇格できた**。
- 新: `IF caller_role IS DISTINCT FROM 'admin'`（NULL も非admin として弾く）。schema.sql + migration の両方に反映。pgTAP `rls_set_user_admin_role.sql` の INV-01/02 が修正前は検出(not ok)、修正後 **5/5 ok**。

## コード外の運用作業（人手で必要・要対応）

| REQ | 人手作業 |
|---|---|
| 210 | GitHub Settings で Dependabot alerts / Secret scanning / Push protection 有効化、Branch protection で required status checks(test/e2e/rls-tests) と CODEOWNERS レビュー必須化。詳細は `.github/SECURITY_SETUP.md`。**audit ジョブは当面 high を warning 化**（既存 `next`/`ws` の high あり→依存更新は別途） |
| 211 | Sentry UI > Security&Privacy で Data Scrubbing 有効化、Additional Sensitive Fields に `email`/`ip_address`/`reporter_ip`/`request_ip` 等を登録（`docs/security/sentry-data-scrubbing.md`） |
| 212 | Cloudflare Turnstile アカウント作成→site/secret key 発行、Supabase Auth で CAPTCHA 有効化(secret設定)、Vercel に `NEXT_PUBLIC_TURNSTILE_SITE_KEY` 設定（`docs/security/captcha-setup.md`）。未設定の間は CAPTCHA はスキップされる |
| 215 | `AI_MAX_IMAGE_BYTES`/`AI_MAX_AUDIO_BYTES` と自動承認しきい値の最終決定（コード既定: 画像10MiB/音声15MiB/floor0.5） |
| 216 | 本番デプロイ後に COOP/CORP 適用で 地図(OSM)/GTM/OG画像/Supabase画像/geolocation が壊れないか動作確認 |
| 217 | 暗号鍵生成(age/gpg)、GitHub Secrets 投入(`SUPABASE_DB_URL` 他)、オフサイト保管先選定、**リストア訓練を最低1回実施し記録** |
| 218 | GCP 予算アラート/Cost Anomaly Detection、Vercel Spend Management、Supabase 週次使用量確認（`docs/runbooks/cloud-cost-guardrails.md`） |
| 219 | DNS設定: `zarigani-das.com` の SPF(1本化・`~all`→`-all`)/DKIM(Resend)/DMARC(`p=none`→`quarantine`→`reject`)、`zaridasu.com` は null SPF/DMARC。Resend ドメイン検証、Supabase SMTP 設定（`docs/runbooks/email-authentication.md`）。**Web=zaridasu.com とメール=zarigani-das.com の不一致は runbook で別運用方針を明記** |
| 220 | runbook 内の連絡先プレースホルダの実値管理、法令(個人情報保護委員会報告)の最新確認、半期ごと見直し |
| 221 | Supabase ダッシュボード: SSL Enforcement / Network Restrictions / アカウント・組織 MFA / PITR / Exposed schemas を `public` に / Security Advisor を Rerun し ERROR/WARN を 0 件化（`docs/runbooks/supabase-hardening-checklist.md`） |

## 追加実装（2026-06-16・残課題1〜3を実装完了）

当初スコープ/競合回避で見送っていた3件を、追加で並列エージェント実装。全 green（schema:check / type-check / フロント test 407 / Edge Function test 239・0 failed / build）。

1. ✅ **REQ-212 caller スロットル配線**: `analyze-image/audio` の reanalysis ブロックに `checkReanalysisCallerRateLimit(reanalysisCallerKey(callerUserId, req))` を配線（caller→post_id の順で評価、admin は bypass、超過時 429）。`aiRateLimit.ts` の env は module ロード固定→呼び出し毎 getter に修正（運用切替を有効化）。テスト各2件追加。
2. ✅ **REQ-215 FR-215-07(b) AI異常検知通知**: migration `20260616000003_ai_anomaly_detection.sql`（`detect_ai_anomalies()` 集計関数 + pg_cron 15分毎 + `admin_alerts.alert_type='ai_anomaly'`）、新 EF `notify-ai-anomaly`、`docs/runbooks/ai-anomaly-detection.md`。auto-approve率/ユーザー・IP別呼出/総呼出を窓集計、min_samples で少数誤検知防止、6h 重複抑制、PII最小・redaction二重。analyze-* には非干渉（事後集計方式）。
3. ✅ **REQ-221 広範な GRANT 見直し**: migration `20260616000004_grant_hardening.sql` + schema.sql。内部4テーブル/ビュー（`admin_login_attempts`/`geo_cache`/`lifecycle_email_log`/`user_last_active`）の anon/authenticated GRANT を REVOKE（フロント非アクセスを確認済み）。pgTAP 20件。**`audit_logs`/`ai_call_logs`（フロントが直接参照）/`admin_alerts`/`experiments`系は安全のため REVOKE せず runbook 手動手順(C-3-b)に退避**。

→ migration は計4本に: `20260616000001` hardening / `000002` rate_limit / `000003` ai_anomaly / `000004` grant_hardening。

## 残課題（別件・要運用判断）

- **REQ-210 関連 / REQ-017**: `docs/verification-2026-05-13.md` に過去漏洩の Gemini API キー / Supabase access token が平文残存。gitleaks では commit+path 限定でピン留め。**失効 + 履歴除去は REQ-017 で対応**（完了後ピン留め削除）。
- **既存の型注釈の粗さ**: `supabase/functions/_shared/mailer.ts:122`（前セッション REQ-234 由来）に `as` cast の TS2352。CI は `--no-check`、tsc は対象外で検出されずランタイム影響なし。気になれば別途整理。
