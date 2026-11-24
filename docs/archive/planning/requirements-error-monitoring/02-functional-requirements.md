## 機能要件

### F1: Sentry SDK の初期化

- `main.jsx`（アプリのエントリーポイント）で `Sentry.init()` を実行
- 環境変数 `VITE_SENTRY_DSN` で DSN を管理（コードにハードコードしない）
- `environment`: `import.meta.env.MODE`（development / production）
- `release`: `import.meta.env.VITE_APP_VERSION` または `package.json` の version
- **開発環境（DEV）では送信しない**：`enabled: import.meta.env.PROD`

### F2: 既存 `logError()` の拡張

現在の `errorHandler.ts` を修正：

```typescript
export function logError(err: unknown, context = ''): void {
  if (import.meta.env.DEV) {
    console.error(`[${context}]`, err)
  }
  // 本番環境: Sentry へ送信
  if (import.meta.env.PROD) {
    Sentry.captureException(err, {
      tags: { context },
    })
  }
}
```

- 既存の `logError()` 呼び出し箇所（usePostList, usePostForm, useEditPost, useDeletePost 等）は**変更不要**

### F3: ErrorBoundary との統合

- `@sentry/react` の `Sentry.ErrorBoundary` でラップ、または既存 `ErrorBoundary` の `componentDidCatch` 内で `Sentry.captureException()` を呼び出す
- `componentStack` をコンテキストとして付与

### F4: パフォーマンス監視（オプション）

- `Sentry.browserTracingIntegration()` でページ遷移・API呼び出しのトレーシング
- `tracesSampleRate: 0.1`（10%サンプリング、無料枠の範囲内）

### F5: ユーザーコンテキストの付与

- ログイン中のユーザーは `Sentry.setUser({ id: user.id })` で紐付け
- ログアウト時は `Sentry.setUser(null)` でクリア
- **メールアドレスは送信しない**（プライバシー配慮）

### F6: Source Map アップロード

- Vite ビルド時に Source Map を生成（`sourcemap: true`）
- Vercel デプロイ時に `@sentry/vite-plugin` で自動アップロード
- 本番配信の Source Map はユーザーに公開しない（`sourcemap: 'hidden'`）

---
