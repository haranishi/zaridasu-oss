#### strict: true 移行時の注意点

```typescript
// strict: false → true で頻出するエラーパターンと対処法

// 1. null チェック（strictNullChecks）
//   エラー: Object is possibly 'null'
//   対処: post?.photos ?? []

// 2. 暗黙的 any（noImplicitAny）
//   エラー: Parameter 'err' implicitly has an 'any' type
//   対処: (err: unknown) または (err: Error)

// 3. 未使用変数（noUnusedLocals）
//   エラー: 'xxx' is declared but its value is never read
//   対処: 削除 または _ プレフィックス
```

---

### CI への組み込み

```yaml
# .github/workflows/ci.yml
name: CI

on: [push, pull_request]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run type-check   # 型チェック
      - run: npm test             # テスト実行
```

---

### 非機能要件

| # | 要件 | 基準 |
|---|------|------|
| NF1 | TypeScript 導入でビルド時間が増加しない | `tsc --noEmit` は型チェックのみ。ビルド自体は Vite が処理 |
| NF2 | 既存コードのランタイム挙動を変えない | .js → .ts はリネームのみ。ロジック変更禁止 |
| NF3 | 自動生成ファイルは git 管理する | `database.types.ts` はコミット対象（スキーマとの同期記録） |

---
