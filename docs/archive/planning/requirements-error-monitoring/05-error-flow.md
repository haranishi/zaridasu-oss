## 画面遷移・ユーザーフロー

```
[エラー発生] → [ErrorBoundary or catch block]
                    ↓
              [logError() / Sentry.captureException()]
                    ↓
              [Sentry ダッシュボード に表示]
                    ↓ アラート設定済み
              [開発者にメール通知]
                    ↓
              [Sentry で詳細確認: スタックトレース、ブラウザ、OS、ユーザーID]
```

ユーザー側のフローに変更なし（透過的に動作）。
