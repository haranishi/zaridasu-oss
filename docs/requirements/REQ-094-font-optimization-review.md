# REQ-094: フォント最適化レビュー（現状維持の判断記録）

> 親 REQ: REQ-092（Web アプリ軽量化包括要件）

## 背景
パフォーマンス改善の一般的施策として「フォント最適化」が挙げられるため、ザリダスの現状フォント設定を棚卸ししてレビューを行う。

現状（`src/app/layout.tsx`）：
```ts
import { Inter } from 'next/font/google'
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})
```

- `next/font/google` 経由で Inter をセルフホスティング（CLS リスク無し、3rd party 通信無し）
- `subsets: ['latin']` のみ → 日本語グリフは含まれない（システムフォントにフォールバック）
- `display: 'swap'` → FOUT で初期表示優先
- `variable: '--font-inter'` → CSS 変数として配信、Tailwind の `font-sans` と組み合わせ
- `body` に `inter.className` を適用（`src/app/layout.tsx`）

## 現状の問題（実は無し）
レビュー結果、本プロジェクトのフォント設定は **既にほぼ最適**：
- 日本語グリフは Web フォント化していない（システムフォント = `-apple-system, "Hiragino Kaku Gothic ProN", "Noto Sans JP" 等` を OS 提供で利用） → 数百 KB の Web フォント転送が発生しない
- `display: swap` で FOUT 戦略
- セルフホスト → 3rd party DNS / 接続コストなし
- `subsets: ['latin']` → 必要グリフのみ

## 目的
**「フォントは触らない」** という判断をドキュメント化し、将来「日本語 Web フォント（Noto Sans JP 等）を追加すべき」という提案が出た際に、根拠を持って却下できるようにする。

## 要件

### 機能要件
- [ ] FR-094-01: 現状の `next/font/google` 設定を維持する。
- [ ] FR-094-02: 日本語 Web フォントの追加は **しない**（システムフォント運用を継続）。
- [ ] FR-094-03: `inter.className` が `<body>` に正しく適用されていること、`<html className={inter.variable}>` で CSS 変数も正しく流れていることを確認するだけ。

### 非機能要件
- [ ] NFR-094-01: フォント由来の CLS = 0 を維持する（既に達成済）。
- [ ] NFR-094-02: フォント由来の追加リクエスト数を増やさない。

## 受入条件
- [ ] AC-01: 本書をレビュー記録として `docs/requirements/REQ-094-font-optimization-review.md` に保存（このファイル自体）。
- [ ] AC-02: `src/app/layout.tsx` のフォント設定に変更が **無い** ことを確認する PR レビュー手順を残す。
- [ ] AC-03: 将来「日本語 Web フォント追加」の PR が来たら、本書を理由に reject すること（運用ルール）。

## 例外（Web フォント追加を検討してよい条件）
以下が **同時に満たされた場合のみ** 再検討する：
1. デザイン要件として OS フォント差異が重大な UX 問題を引き起こす測定可能な根拠がある（例：A/B テストで離脱率有意差）
2. サブセット化（unicode-range で常用漢字＋平仮名＋片仮名のみ）で 80KB 以下に抑えられる
3. `display: optional` または `font-display: swap` + プリロードで CLS / LCP に影響しないことを Lighthouse で実測

## 影響範囲
- 設定変更なし（記録のみ）

## 優先度
- **緊急度**: Low（記録目的）
- **重要度**: Low
- **理由**: 「やらないことを決める」ためだけの REQ。実装作業ゼロ。

## 実装メモ
- `next/font/local` でローカルフォントを使う構成も検討されたが、Inter は Google Fonts 経由のセルフホストで十分。
- `preload` 属性は `next/font/google` がデフォルトで有効にする。
