## 目的
- Sentry へ送るイベント／トランザクションから、メールアドレス・IP（`reporter_ip` / `request_ip` 含む）・トークン・投稿本文/コメント/通報内容/位置情報などの PII を**送信前に確実に除去**する。
- `sendDefaultPii: false` を明示してコードに意図を固定し、SDK 既定の変動に対して頑健にする。
- クライアントで一次スクラブ、サーバー/Edge で二次スクラブ、Sentry サーバー側 Data Scrubbing で三次スクラブ、という多層防御にする。
- 実行ログ（Edge Function）に PII を残さない（CWE-532 対策）。`captureException` / エラーメッセージに PII を埋め込まない規律を確立する。
- REQ-200 の変更（`global-error.tsx`・`instrumentation-client.ts` 移設）後も同じスクラブが適用される整合を保つ。

## 要件
### 機能要件
- [ ] FR-211-01: 3 ランタイムの `Sentry.init`（`sentry.client.config.ts:15`・`sentry.server.config.ts:14`・`sentry.edge.config.ts:14`）に **`sendDefaultPii: false` を明示**する。REQ-200 でクライアント初期化を `instrumentation-client.ts` へ移設する場合は移設後ファイルにも明示する。
- [ ] FR-211-02: PII スクラブ用の共通関数（例 `src/lib/sentryScrub.ts` に `scrubEvent(event)` / `scrubTransaction(event)`）を新設し、Sentry イベントから次を除去/マスクする: (a) `event.user`（`email` / `ip_address` / `username` 等）をクリア、(b) `event.request` の `cookies` / `headers`（`authorization`・`cookie`・`x-forwarded-for` 等）/ クエリ文字列、(c) 例外値・メッセージ・`breadcrumbs` 内のメールアドレス・IPv4/IPv6・JWT/`Bearer` トークン・`apikey`、(d) `extra` / `contexts` / `tags` 内の機微キー（`email`・`reporter_ip`・`request_ip`・`ip`・`token`・`authorization` 等）。`aiLogging.ts:137-142` の redact 方針（key/Bearer/Authorization 置換）と整合させ、メール・IP のパターンを追加する。
- [ ] FR-211-03: 各ランタイムの `beforeSend` を「想定済みバリデーションエラーの破棄（現行挙動を維持）」＋「`scrubEvent(event)` の適用」に拡張する。クライアントで一次スクラブし、サーバー/Edge でも同じ `scrubEvent` を二重に適用する（多層防御）。
- [ ] FR-211-04: 各ランタイムの `Sentry.init` に **`beforeSendTransaction`** を追加し、トランザクション名・span 名・`request` から PII（IP/メール/トークン）を除去する（`scrubTransaction` を適用）。`tracesSampleRate: 0.1` のまま、送られるトランザクションが PII を含まないようにする。
- [ ] FR-211-05: Sentry プロジェクトのサーバー側 Data Scrubbing を有効のまま、Additional Sensitive Fields 相当に **`reporter_ip`・`request_ip`・`email`・`ip_address`** 等の自社固有フィールド名を登録する。設定は本リポジトリ外（Sentry UI / プロジェクト設定）になるため、設定値と手順を `docs/`（本 REQ もしくは運用ドキュメント）に記録し、再現可能にする。
- [ ] FR-211-06: `supabase/functions/notify-post-status/index.ts:240` のメールアドレス出力を是正する。`email` をログから外す（`record.id` と `status` のみ残す）か、`maskEmail()`（例 `a***@example.com`）でマスクしてから出力する。`notify-comment` / `notify-survey-request` 含む通知系 Function の `console.*` がメール・本文・通報内容を平文で出さないことを確認・是正する。
- [ ] FR-211-07: `captureException` / `logError` に渡る前段で PII を埋め込まない規律をコード化する。`src/lib/sentryReporter.ts` で `captureException` 前に例外メッセージへ `scrubString` 相当を適用する（最終防波堤）、もしくは少なくとも `beforeSend`（FR-211-03）で確実に除去されることをテストで担保する。エラー生成時にユーザー入力（メール・本文・IP）を `new Error(\`...\`)` へ直接埋め込まない方針を `src/utils/errorHandler.ts` 付近のコメント / 開発者向けドキュメントに明記する。

### 非機能要件（該当する場合のみ）
- [ ] NFR-211-01: スクラブ関数は純粋関数で、`event` が部分的（`exception` 無し・`request` 無し・`user` 無し等）でも例外を投げず安全に動作すること（二次例外で監視自体を壊さない）。
- [ ] NFR-211-02: スクラブによりイベントの**有用性を過度に損なわない**こと（スタックトレースのファイル/行・エラー型・`context` タグ等の非 PII は保持し、PII のみマスクする）。
- [ ] NFR-211-03: 本番以外（dev / preview のうち送信対象外）では従来どおり Sentry へ送信されない送信ガード（DSN かつ本番のみ、`sentry.*.config.ts` の `if (dsn && isProd)`）を維持すること。
- [ ] NFR-211-04: スクラブの正規表現（メール / IPv4 / IPv6 / JWT）は ReDoS を招かない形にし、長大文字列に対しても線形時間で処理すること。`maxValueLength` 等で過大な値の取り込みを抑えることも検討する。
- [ ] NFR-211-05: REQ-200 と本 REQ のどちらが先に実装されても、最終状態で `beforeSend` / `beforeSendTransaction` のスクラブが全初期化箇所（`global-error.tsx` の `captureException` を含む）に適用されていること。
