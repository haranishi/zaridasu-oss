## テストケース（CI ステップ / Given/When/Then）

### TC-01 (INV-01): /admin/posts バンドル上限チェック
- Given: `.size-limit.json` に以下を記述:
  ```json
  [
    { "name": "/admin/posts first load", "path": ".next/static/chunks/app/admin/posts/**/*.js", "limit": "300 KB", "gzip": true },
    { "name": "/ first load", "path": ".next/static/chunks/app/page*.js", "limit": "300 KB", "gzip": true }
  ]
  ```
  （実際のパスは `next build` 後の `.next/build-manifest.json` から `/admin/posts` と `/` のエントリを参照して正確に指定）
- When: CI で `npm run build` → `npx size-limit` を実行
- Then: いずれかのエントリが 300KB を超えると exit code 1

### TC-02 (INV-02): ホームページ `/` バンドル上限チェック
- Given: TC-01 と同じ `.size-limit.json`
- When: CI で意図的に重い依存（例: `moment` or `leaflet` 全体 import）を `src/views/HomePage.tsx` に追加し `npm run build`
- Then: `size-limit` が exit 1 で失敗、どのエントリがオーバーしたかログに出力される

### TC-03 (INV-03): ホームページ Lighthouse Performance 80+ を維持
- Given: `.lighthouserc.json` に以下:
  ```json
  {
    "ci": {
      "collect": {
        "url": ["http://localhost:3000/"],
        "startServerCommand": "npm run start",
        "numberOfRuns": 3
      },
      "assert": {
        "assertions": {
          "categories:performance": ["error", { "minScore": 0.8 }],
          "largest-contentful-paint": ["warn", { "maxNumericValue": 2500 }],
          "cumulative-layout-shift": ["warn", { "maxNumericValue": 0.1 }]
        }
      }
    }
  }
  ```
- When: CI で `npm run build` → `npm run start &` → `npx lhci autorun`
- Then: Performance スコア < 0.8 なら exit 1

### TC-04: 初期導入時のベースライン確定
- Given: 初回実行時は `.size-limit.json` の limit 値を現状値 + 25% バッファで記録（`/`: 290KB, `/admin/posts`: 305KB 等）
- When: main ブランチで 3 回実行し安定値を記録
- Then: 2 週間運用して安定したら `300 KB` 固定に切り替える

