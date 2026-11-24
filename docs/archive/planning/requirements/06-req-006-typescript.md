### REQ-006: TypeScript 導入

**背景**
現在 JSConfig のみで型チェックがなく、Supabase のレスポンス型が未定義。実行時に発見されるバグが多く、開発効率が低下している。

#### ユーザーストーリー

```
As a 開発者,
I want to TypeScript によって型安全にコードを書きたい,
So that コンパイル時にバグを検出し、IDE のサポートを最大限に受けられる。

受け入れ条件:
- [ ] プロジェクトが TypeScript でビルドできる
- [ ] Supabase の型定義が自動生成されて使用されている
- [ ] 主要な型（Post, Comment, Species, InfoType など）が定義されている
- [ ] 既存の JSX コンポーネントが段階的に .tsx に移行されている
- [ ] 型エラーが CI でチェックされる
```

#### 機能要件

| # | 要件 | 優先度 |
|---|------|--------|
| F1 | `tsconfig.json`・`vite.config.ts` を作成し TypeScript を有効化 | 高 |
| F2 | `supabase gen types typescript` で DB 型定義を自動生成する | 高 |
| F3 | `src/types/` に共通型（`Post`, `Comment`, `Species`, `Filter` など）を定義 | 高 |
| F4 | `src/lib/` ファイルを .ts に変換（constants, supabase） | 高 |
| F5 | `src/hooks/` を段階的に .ts/.tsx に変換 | 中 |
| F6 | `src/components/` を段階的に .tsx に変換 | 中 |
| F7 | `package.json` の `type-check` スクリプトを追加し CI に組み込む | 中 |

#### 移行戦略

```
Phase 1（即時）: tsconfig.json 追加、strict: false で緩い型チェック開始
Phase 2（1週間）: 型定義ファイル（types/）作成、lib/ と hooks/ を .ts 化
Phase 3（2週間）: components/ と pages/ を .tsx 化
Phase 4（1ヶ月）: strict: true に移行、型エラーを全て解消
```

---
