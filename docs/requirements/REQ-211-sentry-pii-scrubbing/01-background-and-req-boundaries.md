## 背景
ザリダス (Next.js 15 App Router) は `@sentry/nextjs ^10.52.0`（`package.json:29`）でエラー監視を行う。初期化は `src/instrumentation.ts` から `sentry.server.config.ts` / `sentry.edge.config.ts` を `register()` で読み込み、クライアントは `sentry.client.config.ts` で `Sentry.init()` する構成で、本番のみ `NEXT_PUBLIC_SENTRY_DSN` + `NODE_ENV === 'production'` のときだけ送信する（`sentry.client.config.ts:11-14`・`sentry.server.config.ts:10-13`・`sentry.edge.config.ts:10-13`）。

本 REQ は Obsidian ノート `13_Monitoring_Logging`（監視・ロギング設計メモ）を下敷きに、「監視のために集めるデータに個人情報(PII)を混入させない」という観点で現状を点検したものである。ザリダスが扱う PII は、ユーザーのメールアドレス、`posts.reporter_ip` / `reports.reporter_ip`（IP アドレス＝PII）、投稿本文・コメント・通報内容・位置情報など多岐にわたる。これらが例外オブジェクト・リクエストコンテキスト・ログ経由で Sentry や実行環境のログに流れ込むと、エラー監視 SaaS という外部サービス上に PII が蓄積し、卒研 PF とはいえ漏洩面・委託先管理上のリスクになる。

実コードと設定を確認したところ、Sentry 送信前の PII スクラビングが事実上未実装で、`beforeSend` は「想定済みバリデーションエラーを捨てる」だけ（PII 除去をしていない）であり、`sendDefaultPii` も明示指定が無い。あわせて Edge Function 側にメールアドレスを標準出力へ書くログ（CWE-532）も残る。いずれも局所的な設定・コード追加で塞げるため、本 REQ で「PII を Sentry/ログに送らない」点に特化して整備する。

> 実装時の注意: `sendDefaultPii` の既定値・`beforeSendTransaction` の引数型・サーバー側 Data Scrubbing（Additional Sensitive Fields）の設定場所（Sentry プロジェクト設定 UI 側）は、**実際にインストールされているバージョン（現状 `@sentry/nextjs ^10.52.0`）** の公式ドキュメント / 型定義で最終確認すること。本 REQ は v10 系を前提に記述するが、マイナー差で API 名・既定値が変わり得る。

### REQ-200 / REQ-179 との境界
- **REQ-200（Sentry 可観測性の堅牢化）との差分**: REQ-200 は `global-error.tsx` の追加・`disableLogger` 等の非推奨/Turbopack 構成の是正・`environment` の preview/production 分離を扱い、**PII スクラビングは対象外**である（`docs/requirements/REQ-200-sentry-observability-hardening.md`）。本 REQ-211 は「PII/機微データを Sentry に送らない」点だけに特化する。両者は同じ `sentry.*.config.ts` を触るため整合が必要で、REQ-200 で新設する `src/app/global-error.tsx`（root layout クラッシュを `Sentry.captureException` で送る）や、`instrumentation-client.ts` へ移設後のクライアント初期化にも、本 REQ で定める `beforeSend` スクラブが等しく適用されるよう、共通のスクラブ関数を初期化箇所で必ず登録すること（REQ-200 が先行した場合は移設後ファイルへ反映、本 REQ が先行した場合は REQ-200 側で移設時に引き継ぐ）。
- **REQ-179（`reporter_ip` の DB 列保護）との関連**: REQ-179 は `posts.reporter_ip`（PII）を DB 側で公開ロールから隠す対策（`docs/requirements/REQ-179-reporter-ip-column-protection.md`）。本 REQ は「同じ PII を監視経路（Sentry／実行ログ）からも漏らさない」という一貫性のための対策であり、DB で守った IP を監視で素通しにしない、という対の関係にある。
