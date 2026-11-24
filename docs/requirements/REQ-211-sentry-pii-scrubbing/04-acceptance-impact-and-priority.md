## 受入条件
- [ ] AC-01: 3 ランタイム（または REQ-200 後の移設先含む）の `Sentry.init` に `sendDefaultPii: false` が明示されている。
- [ ] AC-02: メールアドレス・IPv4/IPv6・JWT/`Bearer` トークンを含むダミー例外を `captureException` した際、`beforeSend` 通過後のイベントから当該 PII がマスク/除去されることを単体テスト（`scrubEvent` のユニットテスト）で確認できる。
- [ ] AC-03: `event.user.email` / `event.user.ip_address` / `event.request.cookies` / `event.request.headers.authorization` がスクラブ後に残らないことをテストで確認できる。
- [ ] AC-04: `beforeSendTransaction` が登録され、トランザクション名・`request` から IP/メール/トークンが除去されることを確認できる。
- [ ] AC-05: `supabase/functions/notify-post-status/index.ts` のログ（`:240` 相当）にメールアドレスが平文で出力されない（除去またはマスク）。通知系 Function の `console.*` に PII 平文が残らない。
- [ ] AC-06: Sentry サーバー側 Data Scrubbing の Additional Sensitive Fields に `reporter_ip` / `request_ip` / `email` / `ip_address` 等が登録され、設定内容が `docs/` に記録されている。
- [ ] AC-07: スクラブ関数が `event` の欠損フィールドに対して例外を投げないことをテストで確認できる（NFR-211-01）。
- [ ] AC-08: `tsc --noEmit` / lint / `next build` が成功し、本番以外で Sentry 送信が行われない送信ガードが維持されている。

## 影響範囲
- `sentry.client.config.ts`（`sendDefaultPii`・`beforeSend`・`beforeSendTransaction`。REQ-200 後は `instrumentation-client.ts`）
- `sentry.server.config.ts` / `sentry.edge.config.ts`（同上）
- `src/lib/sentryScrub.ts`（新規。スクラブ共通関数 + ユニットテスト）
- `src/lib/sentryReporter.ts`（`captureException` 前のスクラブ / 規律）
- `src/utils/errorHandler.ts`（PII を埋め込まない方針コメント。挙動変更は最小）
- `src/app/global-error.tsx`（REQ-200 新設分。`captureException` がスクラブ対象に含まれること）
- `supabase/functions/notify-post-status/index.ts`（メールログのマスク/除去）、必要に応じて `notify-comment` / `notify-survey-request` / `_shared/aiLogging.ts`（PII redact パターン拡張）
- Sentry プロジェクト設定（Data Scrubbing。リポジトリ外、`docs/` に記録）

## 優先度
- **緊急度**: Medium / **重要度**: High / **理由**: 通常時の機能は動くが、現状の `beforeSend` は PII スクラブを一切しておらず、本番でエラーが起きるたびにメール・IP（`reporter_ip` 含む）・トークン・投稿本文などの PII が外部 SaaS（Sentry）へ蓄積し得る。これは個人情報の第三者提供・委託先管理の問題に直結し、REQ-179 で DB 側を保護した IP を監視経路で素通しにする不整合でもある。Edge Function のメール平文ログ（CWE-532）も同種のリスク。修正は `beforeSend` 拡張・`sendDefaultPii: false` 明示・共通スクラブ関数・ログマスクと局所的で、コスト対効果が高い。送信ガード（本番のみ）により現時点の露出母数は限定されるため緊急度は中、機微データ保護の重要度は高。
