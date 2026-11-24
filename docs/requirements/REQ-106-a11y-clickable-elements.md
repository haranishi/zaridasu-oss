# REQ-106: 非インタラクティブ要素のクリックハンドラを a11y 対応に修正

> 親 REQ: REQ-092
> 関連 REQ: REQ-031（accessibility-improvements）

## 背景
ESLint の `jsx-a11y/click-events-have-key-events` と `jsx-a11y/no-static-element-interactions` で **15 件**の警告がビルド時に出ている。`<div onClick>` のようにキーボード非対応・role なしの要素にクリックハンドラを付けるパターン。

スクリーンリーダーで「ボタン」と認識されず、Tab キー / Enter キー操作も効かない。Lighthouse a11y スコアは現状 0.9+ だが、AT 利用者には実害がある。

## 現状の問題
| ファイル | 行 | 内容 |
|---|---|---|
| `src/views/DashboardPage.tsx` | 66 | `<div onClick>` |
| `src/views/DashboardPage.tsx` | 149 | `<div onClick>` |
| `src/views/ProfilePage.tsx` | 69 | `<div onClick>` |
| `src/views/admin/AdminLayout.tsx` | 40 | `<div onClick>` |
| `src/components/features/posts/MicPermissionGuide.tsx` | 47, 54 | `<div onClick>` |
| `src/components/ui/AudioPlayer.tsx` | 119 | `<div onClick>` |
| `src/components/modals/MapModal.tsx` | 59 | `<div role>` 不足 |
| `src/app/providers.tsx` | 102 | 通知バー `<div onClick>` |
| `src/components/layout/DrawerMenu.tsx` | （要確認） | 同類 |

## 目的
非インタラクティブ要素にクリックハンドラを付けるパターンを撲滅し、AT 対応を完成させる。

## 要件

### 機能要件
- [ ] FR-106-01: 上記の 15 箇所をすべて以下のいずれかで修正：
  - **a)** 適切な `<button type="button">` に置換（推奨）
  - **b)** `role="button"` + `tabIndex={0}` + `onKeyDown`（Enter/Space 対応）を追加（`<a>` ライクなセマンティクスが欲しい場合のみ）
- [ ] FR-106-02: 装飾用 `<div>` でクリックハンドラが本当に必要かをレビューし、不要なら削除
- [ ] FR-106-03: ESLint の `jsx-a11y/click-events-have-key-events` を `error` に格上げ（recurrent prevention）

### 非機能要件
- [ ] NFR-106-01: 既存のレイアウト / スタイル / クリック挙動に変化がないこと
- [ ] NFR-106-02: Lighthouse a11y スコアが 0.95 以上を維持
- [ ] NFR-106-03: vitest-axe（REQ-056）の自動 a11y テストで違反 0 件

## 受入条件
- [ ] AC-01: `npm run lint` で `jsx-a11y/click-events-have-key-events` および `jsx-a11y/no-static-element-interactions` の warning が 0 件
- [ ] AC-02: 修正済み要素を Tab で focus でき、Enter/Space でアクションが発火する
- [ ] AC-03: スクリーンリーダー（VoiceOver / NVDA）で「ボタン」と認識される
- [ ] AC-04: Playwright E2E のクリック箇所（`page.click('text=...')` 等）が無修正で動作する
- [ ] AC-05: `eslint.config.js` で `jsx-a11y/click-events-have-key-events: 'error'` 設定済み

## 影響範囲
- 上記 8 ファイル + DrawerMenu.tsx
- `eslint.config.js`（ルール格上げ）

## 優先度
- **緊急度**: Medium
- **重要度**: High
- **理由**: REQ-031 の系譜。AT 対応は法令準拠（JIS X 8341 / WCAG 2.1 AA）にも関わる。実装コスト M（半日）。

## 実装メモ
- 単純な置換例：
  ```tsx
  // Before
  <div onClick={handleClick} className="...">...</div>

  // After
  <button type="button" onClick={handleClick} className="...">...</button>
  ```
- `<button>` 化で CSS が崩れる場合は `className` に `text-left` `bg-transparent` `border-none` `p-0 m-0` 等で素のスタイルに戻す
- `role="button"` パターン例（やむを得ない場合のみ）：
  ```tsx
  <div
    role="button"
    tabIndex={0}
    onClick={handleClick}
    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClick() }}
  >
  ```
- `providers.tsx:102` の通知バー（pendingNotice）は閉じるアクション付きの `<button>` に置換が自然
- AudioPlayer や MapModal は `<button>` に置換が難しければ `role` パターンで対応
