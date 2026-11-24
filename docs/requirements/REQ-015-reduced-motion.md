# REQ-015: prefers-reduced-motion メディアクエリ未対応

## 背景
前庭障害やアニメーション過敏症のユーザーは、OS レベルで「視覚効果を減らす」設定を有効にしている。Web コンテンツはこの設定を `prefers-reduced-motion` メディアクエリで検知し、アニメーションやトランジションを抑制する必要がある（WCAG 2.1 SC 2.3.3 Animation from Interactions）。

## 現状の問題
- `src/app/globals.css`（49-53行目）で、全要素にトランジションを適用するルールが定義されている:
  ```css
  *, *::before, *::after {
    transition-property: background-color, border-color, color;
    transition-duration: 150ms;
    transition-timing-function: ease;
  }
  ```
- このルールはテーマ切替時のスムーズな色変化を目的としているが、`prefers-reduced-motion` メディアクエリで無効化する処理が存在しない
- 55-57行目で `.animate-spin`, `.animate-bounce`, `.animate-pulse` に `transition: none` を適用しているが、これは `prefers-reduced-motion` とは無関係な個別除外であり、OS 設定を尊重していない
- ローディング画面（globals.css 72-287行目）に多数の CSS アニメーション（`loading-ripple`, `loading-float`, `loading-crayfish-bounce`, `loading-bar-slide`, `loading-dot-pulse`, `loading-wave-move` など）が定義されているが、いずれも `prefers-reduced-motion` で抑制されない
- `fadeSlideIn`（290-293行目）、`skeleton-progress`（296-300行目）のアニメーションも同様に無制限

## 目的
`prefers-reduced-motion: reduce` を設定しているユーザーに対して、不要なアニメーションとトランジションを抑制し、アクセシブルな体験を提供する。

## 要件

### 機能要件
- [ ] FR-015-01: `globals.css` の `*` セレクタによるトランジションを `prefers-reduced-motion: reduce` 時に無効化する
  ```css
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      transition-duration: 0.01ms !important;
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
    }
  }
  ```
- [ ] FR-015-02: ローディング画面の全アニメーション（`loading-ripple`, `loading-float`, `loading-crayfish-bounce`, `loading-appear`, `loading-icon-ring`, `loading-bar-slide`, `loading-dot-pulse`, `loading-wave-move`, `loading-text-in`）を `prefers-reduced-motion: reduce` 時に静止状態にする
- [ ] FR-015-03: トースト通知の `fadeSlideIn` アニメーション（290-293行目）を `prefers-reduced-motion: reduce` 時に無効化する
- [ ] FR-015-04: Tailwind CSS の `transition-all` クラス（HomePage.tsx 190行目、208行目など多数で使用）も `prefers-reduced-motion` で抑制されることを確認する
- [ ] FR-015-05: ローディング画面は `prefers-reduced-motion: reduce` 時に静的なスプラッシュ表示（アニメーションなし）とする

### 非機能要件
- [ ] NFR-015-01: WCAG 2.1 Level AAA（SC 2.3.3 Animation from Interactions）準拠
- [ ] NFR-015-02: `prefers-reduced-motion: no-preference`（デフォルト）のユーザーに対する既存のアニメーション体験は変更しない
- [ ] NFR-015-03: テーマ切替（ダーク/ライト）時の色変化は即座に切り替わる形で維持する（トランジションなしでも機能的に問題ない）

## 受入条件
- [ ] AC-01: macOS「アクセシビリティ > ディスプレイ > 視覚効果を減らす」有効時に、ページ上のすべてのアニメーション・トランジションが停止または即時完了する
- [ ] AC-02: ローディング画面が静的に表示される（ザリガニアイコン・テキストは表示されるが、バウンス・波紋・泡・波アニメーションは停止）
- [ ] AC-03: Chrome DevTools の「Emulate CSS media feature prefers-reduced-motion」で動作確認できる
- [ ] AC-04: `prefers-reduced-motion` 未設定時は既存のアニメーションがすべて正常に動作する

## 影響範囲
- `src/app/globals.css`（49-57行目: `*` セレクタのトランジション制御、72-287行目: ローディングアニメーション、290-300行目: その他アニメーション）
- Tailwind CSS 設定（必要に応じて `motion-reduce:` バリアント活用）

## 優先度
- **緊急度**: Medium
- **重要度**: High
- **理由**: `*` セレクタによる全要素への強制トランジションは、OS の `prefers-reduced-motion` 設定を完全に無視しており、前庭障害を持つユーザーに身体的な不快感（めまい、吐き気）を引き起こす可能性がある。WCAG 2.1 SC 2.3.3 の観点から重要度が高い。修正は CSS のメディアクエリ追加のみで実装コストは低い。
