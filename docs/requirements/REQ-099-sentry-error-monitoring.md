# REQ-099: Sentry 接続による本番エラー監視の有効化

> 親 REQ: REQ-092（Web アプリ軽量化包括要件）
> 関連 REQ: REQ-016（error-monitoring — 要件のみで未実装）

## 背景
`src/utils/errorHandler.ts:91` の `logError()` は AuthContext / ErrorBoundary / app/error / 投稿 / コメント / 認証など計 6 箇所以上で呼ばれているが、デフォルト reporter は `noopReporter`（`src/lib/errorReporter.ts`）のままで、本番エラーが完全に silent に消える。

`src/lib/errorReporter.ts` のコメントに Sentry 接続例が記載されているが、`setErrorReporter(...)` を呼ぶ箇所が無いため抽象レイヤーが配線されていない。

## 現状の問題
- `src/utils/errorHandler.ts:11-12` で `noopReporter` を初期値として import
- `src/app/providers.tsx` などのエントリポイントで `setErrorReporter()` 呼び出し無し
- 本番で投稿失敗・認証失敗・unexpected exception が発生しても運用者に通知が来ない
- ユーザー報告に頼った後手対応になりがち

## 目的
本番環境で発生する未捕捉例外を Sentry（or Better Stack 等の同等サービス）に転送し、SLO 監視と障害一次対応の精度を上げる。

## 要件

### 機能要件
- [ ] FR-099-01: `@sentry/nextjs` を依存に追加（Next.js 15 対応版）
- [ ] FR-099-02: `src/lib/sentryReporter.ts`（新規）を作成。`ErrorReporter` 型に準拠した実装で、`Sentry.captureException` を呼ぶ
- [ ] FR-099-03: `src/app/providers.tsx` の最上位で `setErrorReporter(sentryReporter)` を呼ぶ。本番のみ有効化（`process.env.NODE_ENV === 'production'` ガード）
- [ ] FR-099-04: `sentry.client.config.ts` / `sentry.server.config.ts` / `sentry.edge.config.ts` を Sentry CLI wizard で生成
- [ ] FR-099-05: 環境変数 `NEXT_PUBLIC_SENTRY_DSN` を `.env.example` に記載
- [ ] FR-099-06: `tracesSampleRate` を 0.1（本番）/ 0（dev）でデフォルト設定し、既存パフォーマンスを劣化させない
- [ ] FR-099-07: ユーザー操作起因の想定エラー（バリデーションエラー等）は `beforeSend` でフィルタし、Sentry 容量を浪費しない

### 非機能要件
- [ ] NFR-099-01: Sentry SDK の追加で First Load JS が +30KB 以下に収まること
- [ ] NFR-099-02: dev / preview ビルドで Sentry へ送信しないこと
- [ ] NFR-099-03: SourceMap を本番ビルドで Sentry にアップロードし、スタックトレースが解読可能になること

## 受入条件
- [ ] AC-01: `logError(new Error('test'), 'manual-test')` を本番で実行すると Sentry ダッシュボードにイベントが届く
- [ ] AC-02: `app/error.tsx` が発火するシナリオで Sentry にスタックトレース付きで届く
- [ ] AC-03: `.env.example` に `NEXT_PUBLIC_SENTRY_DSN` が含まれる
- [ ] AC-04: `npm run build` で SourceMap アップロードが成功する
- [ ] AC-05: bundle-analyzer で Sentry の SDK サイズが +30KB 以内

## 影響範囲
- `package.json` / `package-lock.json`
- `src/lib/sentryReporter.ts`（新規）
- `src/app/providers.tsx`
- `sentry.{client,server,edge}.config.ts`（新規）
- `next.config.ts`（`withSentryConfig` でラップ — `withBundleAnalyzer` と互換）
- `.env.example`
- Vercel 環境変数設定

## 優先度
- **緊急度**: Critical
- **重要度**: Critical
- **理由**: 本番障害を発見できないこと自体がプロダクトの信頼性を毀損する。Sentry 無料枠で十分（5K errors/month）。半日で接続可能。

## 実装メモ
- `npx @sentry/wizard@latest -i nextjs` で初期化を一気に進めるとほぼ自動。
- `withSentryConfig(withBundleAnalyzer(nextConfig))` の入れ子順に注意。
- `beforeSend` で `event.exception?.values?.[0]?.value?.includes('Validation')` を弾くと S/N 比が上がる。
- Sentry の Performance / Session Replay は容量を食うので最初は OFF。
