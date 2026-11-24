## 現状の問題
（ファイルパス:行番号つき）

### 1. `sendDefaultPii` が明示指定されておらず、IP/Cookie/ヘッダの自動付与に対する歯止めが宣言されていない
- `sentry.client.config.ts:15-29`・`sentry.server.config.ts:14-25`・`sentry.edge.config.ts:14-25` の `Sentry.init({...})` には **`sendDefaultPii` の指定が無い**（`grep -rn "sendDefaultPii" --include="*.ts"` でヒット 0 件）。
- `sendDefaultPii: true` だと SDK がリクエスト IP・Cookie・一部ヘッダ・ユーザー情報などを自動的にイベントへ付与し得る。v10 の既定は `false` の想定だが(推測)、**明示していないため SDK バージョン更新や将来の既定変更で挙動がドリフトしうる**。セキュリティ上の意図（PII を送らない）をコードに固定できていない。

### 2. `beforeSend` が PII を一切スクラブしていない（バリデーションエラー除去のみ）
- 3 ランタイムの `beforeSend` はいずれも**例外メッセージに `Validation` / `ValidationError` を含む場合に `null` を返す**だけで、PII 除去ロジックが無い（`sentry.client.config.ts:22-28`・`sentry.server.config.ts:18-24`・`sentry.edge.config.ts:18-24`）。
  ```ts
  beforeSend(event) {
    const message = event.exception?.values?.[0]?.value ?? ''
    if (message.includes('Validation') || message.includes('ValidationError')) {
      return null
    }
    return event
  }
  ```
- このため、例外メッセージ・例外値・`request`（URL/クエリ/ヘッダ）・`user`・`contexts`・`extra` 等にメールアドレス・IP・トークン・`reporter_ip`・投稿本文等が載っていても**そのまま送信される**。クライアントで落とし、サーバーでも二重に網を張る設計になっていない。
- **`beforeSendTransaction` が未設定**: パフォーマンストランザクション（`tracesSampleRate: 0.1`、`sentry.*.config.ts` 各 18 行目相当）は span 名・トランザクション名に PII（例: クエリ文字列・パスパラメータの IP/メール）を含み得るが、`beforeSendTransaction` でのスクラブが無い（`grep -rn "beforeSendTransaction"` ヒット 0 件）。

### 3. Sentry サーバー側 Data Scrubbing に自社固有の機微フィールドが登録されていない（前提）
- Sentry には標準のサーバー側 Data Scrubbing（`password` / `token` 等の既定パターン除去）があるが、ザリダス固有の機微フィールド名（`reporter_ip`・`request_ip`・`email` 等）は**標準パターンに含まれない**ため、Additional Sensitive Fields 相当の追加登録が無いとサーバー側スクラブをすり抜ける(推測：プロジェクト設定 UI は本リポジトリ外のため、設定有無はコードからは確認不能)。SDK 側 `beforeSend` と Sentry 側 Data Scrubbing の二段構えにする前提が、設定としても文書化としても整っていない。

### 4. `captureException` に渡る例外・コンテキストの PII 無害化が呼び出し側で担保されていない
- クライアントのエラー転送は `src/lib/sentryReporter.ts:16-21` の `sentryReporter` 経由で、`scope.setTag('context', context)` の後に `Sentry.captureException(...)` する。
  ```ts
  export const sentryReporter: ErrorReporter = (err, context) => {
    Sentry.withScope((scope) => {
      if (context) scope.setTag('context', context)
      Sentry.captureException(err instanceof Error ? err : new Error(String(err)))
    })
  }
  ```
  `context` は `'PostForm'` 等の短い発生箇所ラベル（`src/lib/errorReporter.ts:41`）で低リスクだが、`captureException` は**例外オブジェクトそのもの**（`message` / `stack` / 付随プロパティ）を送るため、上流で `new Error(\`... ${userInput}\`)` のようにユーザー入力やメール/IP を埋め込んだ例外が作られていると、そのまま Sentry に届く。
- 登録は `src/app/providers.tsx:17-21` で本番のみ行う（`NODE_ENV==='production'`）。送信ガード自体は妥当だが、**「captureException に PII を含むコンテキストを渡さない／エラーメッセージにユーザー入力を埋め込まない」という規律が、`beforeSend` の最終防波堤を含めて担保されていない**。`logError`（`src/utils/errorHandler.ts:91-106`）はメッセージを `console.error` し、レポーターへ転送するが、PII 除去はしていない。

### 5. Edge Function のログにメールアドレスが平文で出力される（CWE-532）
- `supabase/functions/notify-post-status/index.ts:240` は通知送信時に**受信者メールアドレスを標準出力へ記録**する。
  ```ts
  console.log(`[notify-post-status] post ${record.id} → ${record.status} 通知送信 → ${email}`)
  ```
  Supabase Edge Function のログ（および将来 Sentry/外形監視へ集約する場合）に PII が残る（CWE-532: Insertion of Sensitive Information into Log File）。
- AI 系ログユーティリティ `supabase/functions/_shared/aiLogging.ts` は `redactAiErrorMessage()`（`:137-142`）で API キー・`Bearer`・`Authorization` を除去してから `ai_call_logs.error_message` に保存しており（`logAiCall` `:226-228`）、**機微情報の除去という考え方は既に部分的に存在する**。一方この redact は API キー類のみが対象で、メール・IP・本文は対象外。
- その他の `console.error(e)` 系（例 `supabase/functions/notify-comment/index.ts:167`、`notify-survey-request/index.ts:274`、各 analyze-* の `console.error("...", e)`）は、例外オブジェクトに本文・メール等が含まれていればログへ流れうる(推測：実際に PII を含むかは例外内容依存)。
- なお `reporter_ip` / `request_ip` は Edge Function 内では生成・ログされておらず（`grep -rn "reporter_ip\|request_ip" supabase/functions` はヒット 0 件、設定は DB の `set_post_reporter_ip` トリガー側）、これらが Sentry に載るとすれば DB から `select('reporter_ip')` した行を含む例外・コンテキスト経由になる。`reporter_ip` を含む列をエラーコンテキストに載せない、という規律が必要（REQ-179 と対）。
