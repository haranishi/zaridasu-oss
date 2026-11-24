### F2: テスト環境構成

```
playwright/
├── e2e/
│   ├── home.spec.ts          # P1-1: トップページ
│   ├── auth.spec.ts          # P1-2: 認証フロー
│   ├── post-create.spec.ts   # P1-3: 投稿作成
│   ├── post-detail.spec.ts   # P1-4: 投稿詳細
│   ├── admin.spec.ts         # P1-5: 管理者フロー
│   ├── comments.spec.ts      # P2-6: コメント
│   ├── likes.spec.ts         # P2-7: いいね
│   ├── post-edit.spec.ts     # P2-8: 編集・削除
│   ├── dashboard.spec.ts     # P2-9: ダッシュボード
│   └── trends.spec.ts        # P2-10: トレンド
├── fixtures/
│   ├── auth.ts               # ログイン済みユーザーの fixture
│   └── test-image.jpg        # テスト用画像
├── playwright.config.ts
└── global-setup.ts           # テスト用ユーザー作成
```

### F3: テストデータ戦略

- **テスト用 Supabase プロジェクト**（本番とは別）を使用
- `global-setup.ts` でテストユーザー（一般 + 管理者）を作成
- 各テストスイートは `beforeEach` でテストデータを投入、`afterEach` でクリーンアップ
- テスト用画像ファイル（`test-image.jpg`）を `fixtures/` に配置

### F4: ブラウザ・デバイスマトリクス

| ブラウザ | ビューポート | 用途 |
|---------|------------|------|
| Chromium | 1280x720 | デスクトップ表示 |
| Chromium | 375x812 (iPhone SE) | モバイル表示（タブ切替、FAB） |
| WebKit | 375x812 | Safari 互換確認 |

- Firefox は将来追加（現時点ではスキップしてCI時間を短縮）
