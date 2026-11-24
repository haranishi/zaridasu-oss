# REQ-115: 未使用変数の一括クリーンアップ

> 親 REQ: REQ-092
> 関連 REQ: REQ-102（HomePage 死コード — 部分集合）

## 背景
ESLint の `@typescript-eslint/no-unused-vars` 警告が **17 件** 残存している。テスト / hooks / コンポーネントに散在し、コード可読性とビルドログの S/N 比を下げている。

REQ-102 で HomePage 5 件は対応予定だが、残り 12 件分も同じバッチで掃除する。

## 現状の問題
| ファイル | 行 | 内容 |
|---|---|---|
| `src/hooks/__tests__/useLike.test.ts` | 8-12 | `eqMock`, `eqUserMock`, `maybeSingleMock`, `deleteEqMock` |
| `src/hooks/__tests__/usePostList.test.ts` | 102, 126 | `Unexpected any`（別 lint だが同 PR で修正） |
| `src/hooks/usePostForm.ts` | 287 | `inserted` 未使用 |
| `src/hooks/useOfflineQueue.ts` | 72 | `inserted` 未使用 |
| `src/components/features/posts/PostForm.tsx` | 49 | `audioBlob` 未使用 |
| `src/components/features/posts/__tests__/PostCard.test.tsx` | 2-3 | `beforeEach`, `fireEvent` 未使用 |
| `src/components/layout/BottomNav.tsx` | 31 | `onSurveyClick` 未使用 prop |
| `src/views/__tests__/TrendsPage.test.tsx` | 1 | `beforeEach` 未使用 |
| `src/lib/constants.ts` | 4 | `Unused eslint-disable directive` |
| `src/app/post/[id]/page.tsx` | 22 | `ogImage` 未使用 |

## 目的
全 17 件の `no-unused-vars` warning を解消し、ビルドログをクリーンに保つ + lint の `error` 化への布石。

## 要件

### 機能要件
- [ ] FR-115-01: 上記 17 件の未使用変数を一つずつ判断：
  - **削除**：インスポート / 変数 / 関数引数を削除
  - **意図あり**：`_` プレフィックスを付与（`_inserted`）
- [ ] FR-115-02: `BottomNav.tsx:31` の `onSurveyClick` は呼び出し元で渡されているか確認し、不要なら型定義から削除
- [ ] FR-115-03: `lib/constants.ts:4` の `Unused eslint-disable directive` warning は該当ディレクティブ自体を削除
- [ ] FR-115-04: `usePostList.test.ts` の `Unexpected any` 2 件も `unknown` に置換
- [ ] FR-115-05: 完了後 `npm run lint -- --max-warnings=0` で warning 0 件を達成
- [ ] FR-115-06: `eslint.config.js` で `@typescript-eslint/no-unused-vars` を `error` に格上げ（recurrent prevention）

### 非機能要件
- [ ] NFR-115-01: 既存テストが全て pass
- [ ] NFR-115-02: ビルドが成功
- [ ] NFR-115-03: 機能挙動に変化がないこと

## 受入条件
- [ ] AC-01: `npm run lint` の warning が 0 件（または `_` プレフィックス付与で抑制済み）
- [ ] AC-02: `npm run build` 成功
- [ ] AC-03: `npm test` で 261 tests pass を維持
- [ ] AC-04: `eslint.config.js` で `no-unused-vars` が `error`
- [ ] AC-05: PR の差分が「削除」と「`_` プレフィックス付与」のみで、機能変更を含まない

## 影響範囲
- 上記 10 ファイル
- `eslint.config.js`

## 優先度
- **緊急度**: Low
- **重要度**: Medium
- **理由**: コード衛生。S 規模（半日）。一気に潰すことで「lint warning が常時出ている状態」から「warning ゼロ」に切り替え、リグレッション検知精度が上がる。

## 実装メモ
- 単純削除で済むのは大半。`audioBlob` / `inserted` などの destructuring された値も他で使われていなければ削除
- `BottomNav.tsx:31` は親コンポーネントから渡されているかを確認。渡されていなければ型定義からも削除
- テストファイルの `beforeEach` / `fireEvent` 未使用は import 文だけ削除
- `lint --fix` で auto-fixable なものは一括修正できる場合がある（ESLint 9 + `--fix`）
- `eslint.config.js` 修正：
  ```js
  '@typescript-eslint/no-unused-vars': ['error', {
    argsIgnorePattern: '^_',
    varsIgnorePattern: '^_',
    caughtErrorsIgnorePattern: '^_',
  }],
  ```
