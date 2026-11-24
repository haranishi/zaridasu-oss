# REQ-039: ESLint に @typescript-eslint プラグインを導入

## 背景
本プロジェクトは Next.js 15 App Router + TypeScript（strict: true, noUncheckedIndexedAccess: true）で構成されている。`eslint.config.js` の TS/TSX 向けブロックでは TypeScript パーサーを読み込んでいるものの、TypeScript 固有の lint ルールを提供する `@typescript-eslint/eslint-plugin` が導入されておらず、型情報を活用した静的解析ができていない。

## 現状の問題
- `eslint.config.js:56-98` TS/TSX ブロックはパーサーのみ設定され、プラグインと型情報ルールが未導入

```js
// eslint.config.js:56-76
  // TS/TSX ファイル（TypeScriptパーサー使用）
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      '@next/next': nextPlugin,
      react: reactPlugin,
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
    },
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2022,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
```

- `package.json:34-57` devDependencies に `@typescript-eslint/eslint-plugin` が存在しない（`@typescript-eslint/parser` のみ）
- 結果として、`no-floating-promises`・`no-misused-promises`・`no-unnecessary-condition`・`consistent-type-imports`・`no-explicit-any` など、型情報必須の推奨ルールが一切効いていない
- `parserOptions.project` も未指定のため、仮にルールを追加しても型情報ベースの解析が走らない

## 目的
TypeScript 固有の lint ルールを有効化し、非同期処理の取り扱いミスや不要な型アサーションなどを静的に検出できるようにして、実行時バグの混入を未然に防ぐ。

## 要件

### 機能要件
- [ ] FR-039-01: `@typescript-eslint/eslint-plugin` を devDependency に追加する（`@typescript-eslint/parser` とメジャーバージョンを揃える）
- [ ] FR-039-02: `eslint.config.js` の TS/TSX ブロックに `plugins: { '@typescript-eslint': tsPlugin }` を追加する
- [ ] FR-039-03: `languageOptions.parserOptions` に `project: './tsconfig.json'` と `tsconfigRootDir` を設定し、型情報ベース解析を有効化する
- [ ] FR-039-04: `recommended-type-checked` 相当のルールセットを適用する（最低限 `no-floating-promises`, `no-misused-promises`, `consistent-type-imports`, `no-unnecessary-condition` を有効化）
- [ ] FR-039-05: 新ルールで検出された既存違反をすべて修正する（もしくは段階移行として warn で導入）

### 非機能要件
- CI の lint ステップ実行時間増加を 30 秒以内に抑える（型情報解析の負荷考慮）
- `src/test/**`, `src/**/__tests__/**` では型情報ルールを warn または off に緩和可能とする

## 受入条件
- [ ] AC-01: `npm run lint` 実行時に `@typescript-eslint/no-floating-promises` などのルールが走っている（ルール名が warning/error 出力に現れる or 違反 0 で緑）
- [ ] AC-02: `npm run type-check` が緑である
- [ ] AC-03: CI ワークフロー（lint ジョブ）が緑である
- [ ] AC-04: `eslint --print-config src/app/page.tsx` で `@typescript-eslint/*` ルールが含まれることが確認できる

## 影響範囲
- `eslint.config.js`
- `package.json` / `package-lock.json`
- `src/**/*.{ts,tsx}` 全般（既存違反の修正箇所）
- CI ワークフロー（lint 実行時間）

## 優先度
- **緊急度**: Medium
- **重要度**: Medium
- **理由**: 現時点で動作に支障はないが、型情報を活かした静的解析が効かないことで Promise 取り扱いミスなどが擦り抜けるリスクがあり、品質担保のため早期に整備すべき。
