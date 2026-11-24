## 非機能要件

| 項目 | 要件 |
|-----|------|
| コスト | Sentry Developer プラン（無料: 5,000 errors/月、1 ユーザー） |
| パフォーマンス影響 | SDK サイズ約 30KB gzip。遅延読み込み（`Sentry.lazyLoadIntegration`）を検討 |
| プライバシー | PII（個人情報）は送信しない。ユーザーID のみ。beforeSend で機密情報をフィルタ |
| データ保持 | Sentry 無料プランのデフォルト（30日間） |
| アラート | Sentry ダッシュボードで新規 issue 発生時にメール通知を設定 |

---

## 実装設計

### 新規ファイル

| ファイル | 内容 |
|---------|------|
| `src/lib/sentry.ts` | Sentry 初期化設定（init, browserTracingIntegration） |

### 変更ファイル

| ファイル | 変更内容 |
|---------|---------|
| `package.json` | `@sentry/react`, `@sentry/vite-plugin` を追加 |
| `src/main.jsx` | `import './lib/sentry'` を最上位に追加 |
| `src/utils/errorHandler.ts` | `logError()` に Sentry 送信を追加 |
| `src/components/ui/ErrorBoundary.jsx` | `componentDidCatch` に `Sentry.captureException()` 追加 |
| `src/context/AuthContext.jsx` | ログイン/ログアウト時に `Sentry.setUser()` 呼び出し |
| `vite.config.js` | `@sentry/vite-plugin` を追加（Source Map アップロード） |
| `.env.local` | `VITE_SENTRY_DSN` を追加 |
| `vercel.json` | Vercel 環境変数に `SENTRY_AUTH_TOKEN`, `VITE_SENTRY_DSN` を設定 |

---
