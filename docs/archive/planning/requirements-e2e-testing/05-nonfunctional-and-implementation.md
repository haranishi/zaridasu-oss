## 非機能要件

| 項目 | 要件 |
|-----|------|
| 実行時間 | P1 テスト全体で 2 分以内（CI 上） |
| 安定性 | Flaky rate 5% 以下。リトライ: `retries: 1`（CI のみ） |
| 並列実行 | `workers: 2`（CI）、`workers: 1`（ローカル） |
| テストデータ隔離 | 各テストが独立。並列実行しても干渉しない |
| レポート | HTML レポート + スクリーンショット（失敗時自動取得） |

---

## 実装設計

### 新規ファイル

| ファイル | 内容 |
|---------|------|
| `playwright.config.ts` | Playwright 設定（ブラウザ、ビューポート、ベースURL、タイムアウト） |
| `playwright/global-setup.ts` | テストユーザー作成・ログインステート保存 |
| `playwright/fixtures/auth.ts` | ログイン済み状態の Playwright fixture |
| `playwright/e2e/*.spec.ts` | 各テストシナリオ |
| `.github/workflows/playwright.yml` | CI ワークフロー |

### 変更ファイル

| ファイル | 変更内容 |
|---------|---------|
| `package.json` | `@playwright/test` を devDependencies に追加。`"test:e2e"` スクリプト追加 |
| `.gitignore` | `playwright-report/`, `test-results/`, `playwright/.auth/` を追加 |

---
