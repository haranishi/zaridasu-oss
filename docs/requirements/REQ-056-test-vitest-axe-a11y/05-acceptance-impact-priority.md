## 受入条件
- [ ] AC-01: `npm test -- a11y` で 6 ファイル全ケース通過（実行時間 < 10 秒）
- [ ] AC-02: ネガティブ検証 — `src/components/features/posts/PostForm.tsx` 内のいずれかの `<label htmlFor="...">` を削除すると TC-01 が `label` violation で失敗し、`src/components/modals/EditDialog.tsx` の保存ボタン `<button>保存</button>` を `<button aria-label=""></button>` に変えると TC-04 が `button-name` violation で失敗する
- [ ] AC-03: CI で 3 回連続成功（axe は deterministic なので flaky になりにくいが、MutationObserver 依存がある場合は `await waitFor` で安定化）

## 影響範囲
- 新規 devDependency: `vitest-axe`
- 追加: 6 テストファイル + `src/test-utils/renderWithProviders.tsx` + `src/test-utils/axeConfig.ts` + 1 フィクスチャ
- 既存変更: `vitest.setup.ts` に `expect.extend(toHaveNoViolations)` 追加
- 参照のみ: 6 コンポーネントファイル

## 優先度
- **緊急度**: High
- **重要度**: High
- **理由**: REQ-040 の `htmlFor` 修正は、テストが無い限り半年後の不用意な編集で容易に退行する。a11y 対応はユーザー（視覚障害者・キーボード操作・スクリーンリーダー）の根幹 UX であり、全画面を低コストで網羅できる `vitest-axe` 導入は投資対効果が極めて高い。
