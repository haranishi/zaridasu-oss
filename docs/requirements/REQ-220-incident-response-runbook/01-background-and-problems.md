## 背景

ザリダス (Next.js 15 / Supabase[Auth・DB・Storage] / Vercel / GitHub / Sentry / Resend / Gemini) は、卒業研究 PF として一人〜少人数で運用される一方、**複数種類の個人データ (PII) を保持**している。

- ユーザーのメールアドレス（Supabase Auth `auth.users.email`。`get_admin_*` 系 RPC / view で `u.email` を参照: `supabase/schema.sql:448`・`:463`・`:475`・`:778`）
- `posts.reporter_ip`（`supabase/schema.sql:31`）/ `reports.reporter_ip`（`:259`）＝**IP アドレスは PII**（REQ-179 / REQ-211 で保護対象として確立済み）
- 投稿写真・音声（Supabase Storage の `post-photos` / `post-audio` バケット）
- 位置情報（`posts.lat`/`lng` `supabase/schema.sql:16-17`、`survey_requests.lat`/`lng` `:1191-1192`。地図上で可視化される）
- プロフィール（`user_profiles` `supabase/schema.sql:1099-`：display_name / avatar / bio）
- ログイン試行（`admin_login_attempts`：`email_hash`・`ip` を保持し、失敗時に `audit_logs` へ記録 `supabase/schema.sql:1067`）

このため、シークレット漏洩・アカウント乗っ取り・クラウド課金異常・個人データ漏洩・サービス障害といったインシデントは「起こり得る」前提で、**起きたときに一人でも順序立てて動ける手順書（runbook）**が必要である。

セキュリティ研究ノート（Obsidian `02_notes/Security_Research/`）には、本 REQ の下敷きとなる知見が既に体系化されている：

- `07_Incident_Response`（インシデント初動の共通順序・ケース別の気づき方/初動/その後・証拠保全の最小手順・公的相談窓口一覧）
- `23_Leak_Response_Playbook`（認証情報漏洩の判断・即時失効/切替後失効の基準・資格情報種別ごとの手順・終了条件・机上演習）
- `27_Evidence_Preservation_Playbook`（原本・ハッシュ・chain of custody）
- `13_Monitoring_Logging`（検知・ログの取り扱い）

本 REQ は、これらの汎用ノートを **ザリダス固有の構成（Supabase / Vercel / Sentry / Resend / Gemini と上記 PII）に落とし込んだ実務 runbook を `docs/` 配下に整備する**ことを要件化する。

> 実装時の注意: 本 REQ の成果物は**要件定義のみ**であり、runbook 本体の作成は実装フェーズで行う。法令の数値（個人情報保護委員会への報告期限・閾値）や各社の UI・復旧フォーム URL は改正・変更され得るため、runbook 執筆時・対応時に**必ず 2026 年時点の最新を公式一次資料で確認**し、runbook 内に「確認日」を併記すること（Obsidian `07_Incident_Response` の参考資料末尾が同方針）。

## 現状の問題
（ファイルパス:行番号つき。事実ベース）

### 1. 「インシデント対応」を主目的とした runbook が `docs/` に 1 件も存在しない
- `docs/runbooks/` は存在するが、中身は**平時の運用手順**のみで、インシデント初動を扱う手順書が無い（`ls docs/runbooks/` で確認）：
  - `ai-model-rollback.md` / `bundle-analysis.md` / `edge-function-deploy.md` / `gemini-key-rotation.md` / `web-vitals-setup.md`
- このうち `gemini-key-rotation.md` は「Gemini キーの**ローテーション操作**」に特化した運用手順であり、**漏洩を含むインシデント時の初動（記録→証拠保全→封じ込め→影響範囲特定→一次連絡→通報→復旧→再発防止）の判断フローは含まない**（同ファイルは「いつ使うか」「ローテーション手順」「動作確認」で構成され、証拠保全・法令対応・他資格情報への横展開の節が無い）。
- `docs/requirements/` を全文検索しても、「incident / インシデント / 漏えい / 漏洩 / 個人情報保護委員会」を主題とした要件は**存在しない**（`grep -rln` 確認。ヒットするのは AI モデルや CI 等の別文脈での副次的言及のみ）。

### 2. 個人データ漏洩時の「法令対応の入口」がプロジェクト内に明文化されていない
- ザリダスは前述のとおり**メール・IP・位置情報・写真/音声という PII を保持**しているが、これらが外部流出した場合に「個人情報保護委員会への報告義務・本人通知義務をどう判断するか」を示す資料が `docs/` 内に無い。
- Obsidian `07_Incident_Response` の「E. クライアント情報を漏えいした可能性があるとき」/ `23_Leak_Response_Playbook` の「連絡とエスカレーション」に汎用知見はあるが、**ザリダスの保持データ・取得経路（公開投稿フォームの IP 自動取得 `set_post_reporter_ip` `supabase/schema.sql:134-146` 等）に紐づけた判断材料**にはなっていない。

### 3. 検知・証拠の材料はあるが、「インシデント時にどこを見て、何を保全するか」が結びついていない
- 検知/証拠になり得る仕組みは実装済みで散在している：
  - 管理操作の監査ログ `audit_logs`（`supabase/schema.sql:378-`、append-only。`writeAuditLog`＝`src/lib/auditLog.ts`）。ただし **`writeAuditLog` は fire-and-forget で、書き込み失敗は操作をブロックしない**（`src/lib/auditLog.ts:25-27`）＝「監査ログが欠落し得る」前提を runbook で扱う必要がある。
  - ログイン失敗 / レート制限の記録（`admin_login_attempts` → `audit_logs` `supabase/schema.sql:1067`）。
  - Sentry（`sentry.server.config.ts` / `sentry.client.config.ts` / `sentry.edge.config.ts` / `src/instrumentation.ts`。エラー検知。REQ-211 で PII スクラビング、REQ-200 で堅牢化）。
  - AI 呼び出しログ `ai_call_logs`（Gemini 認証失敗等。`gemini-key-rotation.md` の事前確認クエリが参照）。
- これらは「平時の監視」観点では整理されているが、**インシデント時に「最初の 15 分でどのログ・請求明細・監査履歴を、消える前に書き出すか」を一枚にまとめた手順**が無い（`07_Incident_Response`「証拠保全の最小手順」/ `23_Leak_Response_Playbook`「最低限確認するイベント」をザリダスの実テーブル名・ダッシュボードに対応づける作業が未実施）。
