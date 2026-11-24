> ⚠️ **アーカイブ（2026-07-18 / REQ-282 FR-282-B4）**: 歴史的文書（当時のスナップショット）。以後更新しない。現況は `docs/requirements/` の REQ 文書とインデックスを参照。

# 要件定義: テストカバレッジ閾値の修正

## 概要

- **ID**: TEST-003
- **優先度**: 🟠 中
- **作成日**: 2026-03-15
- **対象ファイル**: `vite.config.js`

---

## 問題

`vite.config.js` の coverage thresholds が現状の実態より大幅に低い値に設定されており、CI で品質ゲートとして機能していない。

```js
// 現状（低すぎる）
thresholds: {
  statements: 16,
  branches: 13,
}
```

現状の実測値:
- Statements: 65.08%
- Branches: 53.58%
- Functions: 49.34%

---

## 修正方針

thresholds を現状実測値より少し低い安全なラインに設定し、今後のテスト追加で引き上げていく。

```js
// 修正後（ステップ1: 現状実態値に合わせた最低保証ライン）
thresholds: {
  statements: 60,
  branches: 50,
  functions: 45,
}
```

`functions` は現状 49.34% なので、少し余裕を持たせて 45% に設定する。

### 中期目標（テスト拡充後）

```js
// ステップ2: requirements-test-coverage-expansion.md の実施後
thresholds: {
  statements: 80,
  branches: 70,
  functions: 80,
}
```

---

## テスト観点

- `npm run test:coverage` が閾値を満たして成功すること
- 今後テストを削除した場合に CI で検出できること
