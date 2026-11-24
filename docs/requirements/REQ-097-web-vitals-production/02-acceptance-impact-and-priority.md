## 受入条件
- [ ] AC-01: `package.json` に `web-vitals@^4` が含まれる。
- [ ] AC-02: 本番でホーム / 投稿詳細を開くと、ブラウザ DevTools の Network タブまたは GA4 DebugView で `web_vital` イベントが LCP / INP / CLS について発火する。
- [ ] AC-03: `metric_rating` が `good` / `needs-improvement` / `poor` のいずれかで送信されている。
- [ ] AC-04: 開発環境（`npm run dev`）では送信されない。
- [ ] AC-05: `docs/runbooks/web-vitals-setup.md` に GA4 側の探索レポート手順が記載されている。
- [ ] AC-06: `WebVitalsReporter` のユニットテスト（モック window.dataLayer）が pass する。

## 影響範囲
- `package.json` / `package-lock.json`
- `src/components/common/WebVitalsReporter.tsx`（新規）
- `src/app/layout.tsx`（`<WebVitalsReporter />` 設置）
- `docs/runbooks/web-vitals-setup.md`（新規）
- GTM コンテナ設定（リポジトリ外、手順書のみ）

## 優先度
- **緊急度**: High
- **重要度**: High
- **理由**: REQ-092 の KPI（LCP ≤ 2.5s / INP ≤ 200ms / CLS ≤ 0.1）を **本番値で観測** するための前提。これが無いと Lighthouse 合成値だけで判断することになり、改善の効果証明ができない。

