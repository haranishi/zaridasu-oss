## REQ-006: TypeScript 導入

### 現状の課題

```
現在の型安全性:
  - jsconfig.json のみ（型チェックなし）
  - Supabase レスポンスの型が any → 実行時まで誤りを検出できない
  - Post, Comment, Species などの型が未定義
  - IDE の補完が不完全（型情報がないため）

リスク例:
  - post.species に 'american' 以外の文字列を渡してもエラーにならない
  - Supabase の結果が null の場合を見落とした .photos.map() が実行時エラーになる
  - 新しい DB カラムを追加した際、型が自動更新されない
```

---

### ユーザーストーリー

```
As a 開発者,
I want to TypeScript で型安全にコードを書きたい,
So that コンパイル時にバグを検出し、IDE の補完を最大限に受けられる。

受け入れ条件:
- [ ] プロジェクトが TypeScript でビルドできる（エラーゼロ）
- [ ] Supabase の型定義が自動生成されて使用されている
- [ ] 主要な型（Post, Species, InfoType, Filter など）が定義されている
- [ ] 既存コードの動作が変わらない（ランタイムの変更なし）
- [ ] `npm run type-check` で型エラーが検出される
- [ ] 型エラーが CI でチェックされる
```

---

### 機能要件

#### F1: TypeScript 環境構築（Phase 1 - 即時）

**目標**: 既存コードを壊さずに TypeScript を有効化する

```bash
# 必要パッケージのインストール
npm install -D typescript @types/react @types/react-dom @types/leaflet
```

##### tsconfig.json の作成

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": false,
    "allowJs": true,
    "checkJs": false,
    "noEmit": true,
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] },
    "skipLibCheck": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

**ポイント**:
- `allowJs: true` → 既存 .js/.jsx を変換なしで混在させる
- `checkJs: false` → 既存 JS ファイルには型エラーを出さない（段階的移行）
- `strict: false` → 移行初期は緩い型チェック

##### package.json にスクリプト追加

```json
{
  "scripts": {
    "type-check": "tsc --noEmit"
  }
}
```

---
