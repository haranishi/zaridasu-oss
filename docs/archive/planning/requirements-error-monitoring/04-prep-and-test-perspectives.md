## 実装前の準備作業（コード不要）

1. [sentry.io](https://sentry.io) でアカウント作成 → React プロジェクト作成
2. DSN を取得 → `.env.local` に `VITE_SENTRY_DSN=https://xxx@sentry.io/xxx` として設定
3. Auth Token を取得 → Vercel 環境変数に `SENTRY_AUTH_TOKEN` として設定
4. Sentry ダッシュボードでアラートルール（新規 issue → メール通知）を設定

---

## テスト観点

1. 開発環境（DEV）で Sentry にイベントが送信**されない**こと
2. 本番環境（PROD）でエラーが Sentry ダッシュボードに表示されること
3. `ErrorBoundary` で捕捉されたレンダリングエラーが Sentry に送信されること
4. `logError()` 経由の非同期エラーが context タグ付きで Sentry に記録されること
5. ユーザーID が紐付き、メールアドレスが**含まれない**こと
6. Source Map によりスタックトレースが元のソースコードの行番号で表示されること
7. SDK 追加後のバンドルサイズ増加が 50KB 以下であること

---
