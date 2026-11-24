# REQ-056: vitest-axe によるアクセシビリティ回帰テスト追加

## これは何か

a11y 違反を検出する自動テスト基盤が無いため、REQ-040 で直した関連付けが再び壊れても CI を
素通りしてしまう。`vitest-axe` を導入して主要 6 コンポーネントの axe violations をゼロに固定する要件。
詳細は `REQ-056-test-vitest-axe-a11y/` 配下に分割している。

## 目的・背景（要約）

REQ-040 で PostForm / WeatherSelector の `htmlFor` / `id` 関連付けを修正したが、テストが無い限り
`htmlFor` を外す・`aria-label` を消す・`<button>` を `<div onClick>` に戻すといった退行を検知できない。
対象は PostForm / WeatherSelector / AuthModal / EditDialog / AdminLayout / DetailPageClient の 6 つで、
それぞれに axe smoke テストを追加する。

## 主要な決定事項（要点）

- **守る不変条件は 3 つ**: 6 コンポーネントで `violations.length === 0`（INV-01）、PostForm の各入力が
  label と 1:1 で関連付け（INV-02）、EditDialog のアクションがアクセシブル名を持つ（INV-03）。
- 必須カテゴリは `label` / `form-field-multiple-labels` / `aria-*` / `button-name` / `link-name` / `image-alt`。
  **`color-contrast` は参考扱い（warnings に降格）**とし、axe option で無効化して共通設定に切り出す。
- テストは unit の a11y smoke。新規 devDependency は `vitest-axe` のみで、`vitest.setup.ts` に
  `expect.extend(toHaveNoViolations)` を足す。
- **AC-02 でネガティブ検証を要求**する（label を消すと落ちる／ボタン名を空にすると落ちることを確認）。
  テストが実際に退行を捕まえられることまでを受入条件に含める。
- 実行時間は 6 ファイル全ケースで 10 秒未満を目標とする。

## 各部品

| ファイル | 内容 |
|---|---|
| [01-background-and-invariants.md](REQ-056-test-vitest-axe-a11y/01-background-and-invariants.md) | 背景と対象 6 コンポーネント、守りたい不変条件 INV-01〜03、現状の検出可否 |
| [02-test-setup.md](REQ-056-test-vitest-axe-a11y/02-test-setup.md) | テスト種別と環境（フレームワーク・セットアップ手順・型定義・テストファイルの配置先） |
| [03-test-cases.md](REQ-056-test-vitest-axe-a11y/03-test-cases.md) | テストケース TC-01〜06（Given/When/Then 形式） |
| [04-coverage-and-fixtures.md](REQ-056-test-vitest-axe-a11y/04-coverage-and-fixtures.md) | カバレッジ目標（違反カテゴリ別）とテストデータ / フィクスチャ・axe 共通設定 |
| [05-acceptance-impact-priority.md](REQ-056-test-vitest-axe-a11y/05-acceptance-impact-priority.md) | 受入条件 AC-01〜03、影響範囲、優先度とその理由 |
