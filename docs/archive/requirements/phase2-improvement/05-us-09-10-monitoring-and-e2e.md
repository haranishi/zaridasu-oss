### US-09: Sentry エラー監視統合

```
As a 開発者・運用者,
I want to 本番環境のエラーをリアルタイムで検知・追跡したい,
So that ユーザーに影響が出る前に問題を修正できる.

受け入れ条件:
- [ ] @sentry/nextjs を導入し、クライアント/サーバーの両方でエラーを捕捉する
- [ ] ErrorBoundary.tsx で Sentry.captureException() を呼び出す
- [ ] errorHandler.ts の logError() を Sentry 送信に置き換える
- [ ] ソースマップのアップロードを CI/CD に組み込む
- [ ] 環境変数 SENTRY_DSN を設定する
- [ ] パフォーマンスモニタリング（トランザクション追跡）を有効化する
- [ ] Web Vitals (LCP, FID, CLS) の自動収集を有効にする
- [ ] Slack/Discord 連携でアラートを飛ばす
```

**実装箇所:**
```
src/
├── instrumentation.ts          ★NEW: Sentry サーバーサイド初期化
├── app/
│   ├── global-error.tsx        ★UPDATE: Sentry 連携
├── sentry.client.config.ts     ★NEW: クライアント設定
├── sentry.server.config.ts     ★NEW: サーバー設定
├── sentry.edge.config.ts       ★NEW: Edge 設定
└── utils/
    └── errorHandler.ts         ★UPDATE: Sentry 送信追加
```

**優先度: 高** | **影響度: 大** | **実装コスト: 小**

---

### US-10: Playwright E2E テスト導入

```
As a 開発者,
I want to 主要ユーザーフローの E2E テストを自動実行したい,
So that リグレッションを早期に検知できる.

受け入れ条件:
- [ ] Playwright を導入し、以下のフローをカバーする:
  - ホームページ表示 → 地図ロード → マーカー表示
  - 投稿フォーム表示 → 入力 → 送信 → 完了メッセージ
  - ログイン → ダッシュボード表示 → 投稿一覧確認
  - 管理者ログイン → 投稿承認/却下フロー
  - 投稿詳細 → コメント投稿 → いいね
- [ ] GitHub Actions で PR ごとに E2E テストを実行する
- [ ] テスト用 Supabase プロジェクト（テスト環境）を分離する
- [ ] スクリーンショット比較によるビジュアルリグレッションテストを導入する
- [ ] テスト結果レポートを GitHub PR にコメントとして投稿する
```

**ディレクトリ構成:**
```
e2e/
├── fixtures/
│   └── test-data.ts          # テスト用データ
├── pages/
│   ├── home.page.ts          # ページオブジェクト: ホーム
│   ├── post-form.page.ts     # ページオブジェクト: 投稿
│   ├── detail.page.ts        # ページオブジェクト: 詳細
│   ├── dashboard.page.ts     # ページオブジェクト: ダッシュボード
│   └── admin.page.ts         # ページオブジェクト: 管理画面
├── tests/
│   ├── home.spec.ts
│   ├── post-flow.spec.ts
│   ├── auth-flow.spec.ts
│   ├── admin-flow.spec.ts
│   └── comment-like.spec.ts
├── playwright.config.ts
└── global-setup.ts           # テストユーザー作成・認証
```

**優先度: 高** | **影響度: 大** | **実装コスト: 中**

---

