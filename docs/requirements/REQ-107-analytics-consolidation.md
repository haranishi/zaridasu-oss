# REQ-107: 計測ツール 3 系統重複の整理（GA4 に統一）

> 親 REQ: REQ-092
> 関連 REQ: REQ-097（web-vitals-production）

## 背景
現状ザリダスには 3 系統の計測ツールが並走している：

1. **GTM → GA4**：ページビュー・カスタムイベント（既存）
2. **Vercel Analytics**：別 PR（#4）で外部から自動マージされた `@vercel/analytics/next`（`src/app/layout.tsx:4`）
3. **Web Vitals → GA4**：`WebVitalsReporter`（REQ-097 で本バッチ追加）

GA4 と Vercel Analytics は **同じページビューを 2 重計測**しており、データが分散・コスト増・解釈ノイズ。Vercel Analytics は意図不明な外部 PR 起点で導入された。

## 現状の問題
- `src/app/layout.tsx:4` で `import { Analytics } from '@vercel/analytics/next'`
- `src/app/layout.tsx`（推定 末尾）で `<Analytics />` レンダリング
- `package.json` に `@vercel/analytics` 依存
- GA4 と Vercel Analytics の両方にイベントが飛び、運用ダッシュボードが 2 つに散在

## 目的
計測を **GA4（GTM 経由 + WebVitals 補強）に統一**し、Vercel Analytics を撤去してデータ・コストの 2 重化を解消する。

## 要件

### 機能要件
- [ ] FR-107-01: `src/app/layout.tsx` から `@vercel/analytics/next` の import と `<Analytics />` 配置を削除
- [ ] FR-107-02: `package.json` から `@vercel/analytics` 依存を削除（`npm uninstall @vercel/analytics`）
- [ ] FR-107-03: GA4 で取得できるメトリクス（PV / セッション / Web Vitals / カスタムイベント）に必要なものが全部揃っていることを確認
- [ ] FR-107-04: Vercel ダッシュボードの Web Analytics 機能を OFF にする（コスト発生防止）
- [ ] FR-107-05: 内部 ADR / decision-log として「Vercel Analytics を採用しない理由」を本 REQ に記録（現状記録のみ）

### 非機能要件
- [ ] NFR-107-01: First Load JS が現状以下になる（Vercel Analytics 撤去で軽量化期待）
- [ ] NFR-107-02: GA4 にイベントが従来通り届くことを DebugView で確認

## 受入条件
- [ ] AC-01: `src/app/layout.tsx` に `@vercel/analytics` の import が無い
- [ ] AC-02: `package.json` の dependencies に `@vercel/analytics` が無い
- [ ] AC-03: `npm run build` 成功
- [ ] AC-04: 本番デプロイ後、GA4 の DebugView でページビュー / `web_vital` イベントが届く
- [ ] AC-05: Vercel ダッシュボードで Web Analytics が無効化されている
- [ ] AC-06: bundle-analyzer で `@vercel/analytics` のチャンクが消えている

## 影響範囲
- `src/app/layout.tsx`
- `package.json` / `package-lock.json`
- Vercel プロジェクト設定（手動）

## 優先度
- **緊急度**: Medium
- **重要度**: Medium
- **理由**: 機能影響は無いが、データ・コスト・運用の二重化を解消できる。実装コスト XS（10 分 + デプロイ確認）。

## 実装メモ
- 反対意見を検討：「Vercel Analytics の Real Experience Score (RES) は Vercel 独自指標として価値がある」
  → 反論：本 REQ-097 で web-vitals + GA4 経由で同等以上の指標が取れる。GA4 で P75 を集計可能。Vercel Analytics は冗長
- もし将来「Vercel Speed Insights」（Web Vitals の Vercel 版）を導入したい場合は、改めて REQ を起こす。本 REQ では撤去
- Vercel ダッシュボードの設定変更はリポジトリ管理外なので、リリースノート / runbook に「Vercel Analytics を OFF にする」手順を記録する
