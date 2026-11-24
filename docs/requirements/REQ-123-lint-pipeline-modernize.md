# REQ-123: Lint パイプラインを ESLint CLI に移行し警告ゼロを CI 基準にする

## 背景
`package.json:12` の lint スクリプトは `next lint` のままで、Next.js 15 では「将来削除予定の非推奨コマンド」として警告が出る。また実行時に `@next/next` plugin が flat config から検出されないケース、`react-hooks/exhaustive-deps` の警告が `useOfflineQueue` 等で残っているケースがあり、CI ログにノイズが溜まっている。Next.js 16 アップグレード時のブロッカーになる前に整理しておきたい。

## 現状の問題

### 1. lint コマンドが非推奨の `next lint`
```json
// package.json:12
"lint": "next lint",
```
Next.js 15 では `next lint` 実行時に「ESLint CLI に直接移行してください」という deprecation warning が出る。Next.js 16 で削除予定。

### 2. ESLint plugin の検出がフラットコンフィグで暗黙に依存
`eslint.config.js` は `@next/eslint-plugin-next` を import して使っているが、`next lint` 経由では plugin が二重ロードされたり、`next lint` 独自のルール優先順で flat config の設定が一部上書きされる挙動がある。`eslint .` 直接実行に切り替えれば挙動が安定する。

### 3. react-hooks/exhaustive-deps 警告が残存
`eslint.config.js:50, 98` で `'react-hooks/exhaustive-deps': 'warn'`（error ではない）。`src/hooks/useOfflineQueue.ts` 等で警告が残っている可能性が高い（実行して確認が必要）。`--max-warnings 0` で運用するには警告解消が前提。

### 4. CI で警告許容の上限が無い
`.github/workflows/ci.yml` の lint ステップで `--max-warnings` フラグが付いていなければ、警告が増え続けても CI が通り続ける状態。

## 目的
- `next lint` 依存を解消し、Next.js 16 アップグレード時のブロッカーを除去する。
- CI で警告ゼロを強制し、新規警告の混入を防ぐ。
- 既存の警告を解消する（特に react-hooks/exhaustive-deps）。

## 要件

### 機能要件
- [ ] FR-123-01: `package.json:12` の lint スクリプトを以下に変更する：
  ```json
  "lint": "eslint . --max-warnings 0"
  ```
- [ ] FR-123-02: `eslint.config.js` の `ignores` に `.next/`, `dist/`, `coverage/`, `node_modules/` 等が含まれていることを再確認する（既に含まれているはず、確認のみ）。
- [ ] FR-123-03: `eslint.config.js` で `@next/next` plugin の plugins / rules セクションが flat config 形式で正しく登録されていることを確認・必要なら修正する。
- [ ] FR-123-04: 既存の警告を解消する（`npm run lint` 実行 → 警告一覧を取得 → 各警告を修正）。優先対象：
  - `src/hooks/useOfflineQueue.ts` の react-hooks/exhaustive-deps
  - その他 `npm run lint` で出るすべての warning
- [ ] FR-123-05: `.github/workflows/ci.yml` の lint ステップを `npm run lint` 呼び出しに統一（フラグはスクリプト側で持つ）。
- [ ] FR-123-06: `npm run type-check` と `npm run lint` を分離した CI ステップとして両方を必須にする。

### 非機能要件
- [ ] NFR-123-01: `npm run lint` の実行時間が現状（`next lint`）と比べて極端に遅くならない（許容: +20%）。
- [ ] NFR-123-02: 警告解消の修正は意図しない挙動変更を含まないこと（リファクタや式の意味変更を避ける。`useEffect` 依存の追加は再レンダリング頻度を確認）。

## 受入条件
- [ ] AC-01: `npm run lint` 実行で deprecation warning が出ない。
- [ ] AC-02: `npm run lint` 実行時の警告数が 0。
- [ ] AC-03: 任意のファイルに `// eslint-disable` 抑制コメントを追加せずに 0 警告を達成（既存の `eslint-disable` を増やさない。やむを得ない場合は理由コメント必須）。
- [ ] AC-04: CI で lint ステップが通る。
- [ ] AC-05: `useOfflineQueue.ts` の hook deps 警告が解消され、回帰がないこと（既存テスト `useOfflineQueue.test.ts` がパス）。

## 影響範囲
- 変更対象ファイル
  - `package.json`（lint スクリプト）
  - `eslint.config.js`（plugin 登録の確認・修正）
  - `src/hooks/useOfflineQueue.ts`（hook deps 解消）
  - その他 `npm run lint` で警告が出るファイル群
  - `.github/workflows/ci.yml`（必要なら）
- 影響を受ける機能
  - useOfflineQueue の依存変更次第で、再フェッチ・再ストア頻度が変わる可能性あり（テストで担保）。

## 優先度
- **緊急度**: Medium
- **重要度**: Medium
- **理由**: 直近の機能影響はないが、Next.js 16 アップグレード時に必ず手を入れる必要があり、その時に「警告山盛り＋プラグイン未検出」状態だと修正範囲が膨らむ。今のうちに小さく直しておくのが効率的。
