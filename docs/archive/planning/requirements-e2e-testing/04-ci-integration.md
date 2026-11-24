### F5: CI/CD 統合

- **GitHub Actions** に `playwright.yml` ワークフローを追加
- `main` ブランチへの PR 作成時に自動実行
- テスト失敗時は PR にステータスチェックで通知
- Playwright レポート（HTML）をアーティファクトとして保存

```yaml
# .github/workflows/playwright.yml
name: E2E Tests
on:
  pull_request:
    branches: [main]
jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npx playwright install --with-deps chromium webkit
      - run: npm run build
      - run: npx playwright test
        env:
          VITE_SUPABASE_URL: ${{ secrets.TEST_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.TEST_SUPABASE_ANON_KEY }}
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
```

---
