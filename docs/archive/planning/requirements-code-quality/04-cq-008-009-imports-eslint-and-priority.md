## CQ-008: import パスの一貫性

### 問題

`src/components/features/dashboard/MyPostsSection.jsx` だけが alias パス (`@/lib/supabase`) を使用しており、
他のすべてのファイルが相対パス (`../lib/supabase`) を使っている。

### 受け入れ条件

- [ ] プロジェクト全体で相対パスに統一する（現状の多数派に合わせる）
- [ ] または、`vite.config.js` と `tsconfig.json` に `@` alias を正式設定して全ファイルを alias に統一する
- [ ] どちらかに統一する方針を `docs/` に記録する

---

## CQ-009: ESLint 未設定

### 問題

ESLint が設定されていないため、上記の問題を自動検出できない。
`lint` スクリプトも `package.json` に存在しない。

### 受け入れ条件

- [ ] `eslint`, `eslint-plugin-react`, `eslint-plugin-react-hooks`, `eslint-plugin-jsx-a11y` をインストールする
- [ ] `eslint.config.js`（Flat Config）を作成し以下のルールを有効化する
  - `no-console`: `error`（`errorHandler` の `logError` 以外禁止）
  - `react-hooks/rules-of-hooks`: `error`
  - `react-hooks/exhaustive-deps`: `warn`
  - `jsx-a11y/alt-text`: `error`
  - `jsx-a11y/click-events-have-key-events`: `warn`
- [ ] `package.json` の `scripts` に `"lint": "eslint src/"` を追加する
- [ ] CI（GitHub Actions）で `npm run lint` が通ることを確認する

---

## 実装優先度マトリクス

| 優先度 | 課題 | 理由 | 推定工数 |
|--------|------|------|---------|
| 🔴 即対応 | CQ-009 ESLint 設定 | 以降の課題を自動検出できる基盤 | S（2h） |
| 🔴 即対応 | CQ-001 console 統一 | logError で一括置換可能 | S（1h） |
| 🔴 即対応 | CQ-002 エラーハンドリング | バグ検出に直結 | M（3h） |
| 🟠 今週中 | CQ-005 alt 属性 | a11y 違反・修正コスト低 | S（1h） |
| 🟠 今週中 | CQ-004 定数化 | 変更コスト低・効果大 | S（2h） |
| 🟠 来週 | CQ-003A hooks 抽出（フェーズA） | CommentSection・ReportModal | M（4h） |
| 🟡 中期 | CQ-007 重複コード排除 | storage.js 関数拡張 | M（3h） |
| 🟡 中期 | CQ-006 i18n | 方針決定が先 | L（6h） |
| 🟡 中期 | CQ-003B hooks 抽出（フェーズB） | AuthModal・AuthCallback | M（4h） |
| 🟢 長期 | CQ-003C Admin hooks（フェーズC） | 量が多く段階的に対応 | XL |
| 🟢 長期 | CQ-008 import 統一 | alias 設定か一括置換 | S（1h） |
