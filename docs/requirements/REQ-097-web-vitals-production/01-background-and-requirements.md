## 背景
現状、パフォーマンス計測は CI 上の Lighthouse（`@lhci/cli` / REQ-062）にのみ依存しており、**本番環境のフィールドデータ** が無い。

Lighthouse は合成計測であり、本物のユーザー（モバイル / 4G / バックグラウンドタブ / Service Worker キャッシュ状態）の挙動を反映しない。Google が SEO に使うのは Chrome User Experience Report (CrUX) の **フィールドデータ** で、これに対応するのは `web-vitals` ライブラリで本番から送る方式しかない。

## 現状の問題
- `package.json` に `web-vitals` 依存なし
- `src/app/providers.tsx` で計測 reporter が初期化されていない
- GA4（GTM 経由 / `NEXT_PUBLIC_GTM_ID`）にカスタムイベントが送られていない
- LCP / INP / CLS の本番値が観測されていない → SLO 監視ができない

## 目的
本番ユーザーの Core Web Vitals（LCP / INP / CLS / TTFB / FCP）を GA4 にカスタムイベントとして送信し、SLO 監視 / リグレッション検知の根拠データにする。

## 要件

### 機能要件
- [ ] FR-097-01: `web-vitals` パッケージを dependencies に追加する（`web-vitals@^4`）。
- [ ] FR-097-02: Client Component として `src/components/common/WebVitalsReporter.tsx` を新規作成する。`'use client'` で `onLCP / onINP / onCLS / onTTFB / onFCP` を購読し、`window.dataLayer.push({ event: 'web_vital', metric_name, metric_value, metric_id, metric_rating })` を実行する。
- [ ] FR-097-03: `src/app/layout.tsx`（または `providers.tsx`）の最上位に `<WebVitalsReporter />` を配置する。
- [ ] FR-097-04: 値の四捨五入：CLS は小数 4 桁、それ以外は整数（ミリ秒）。
- [ ] FR-097-05: `metric_rating`（'good' / 'needs-improvement' / 'poor'）も同送する（`web-vitals` v4 の `Metric.rating`）。
- [ ] FR-097-06: GTM 側で `web_vital` イベントを GA4 にフォワードする「タグ」を設定する手順を `docs/runbooks/web-vitals-setup.md`（新規）に記録する（GTM コンテナの設定は本リポジトリ管理外のため、手順書のみ）。
- [ ] FR-097-07: ローカル / プレビュー環境では送信しない（`process.env.NODE_ENV === 'production'` ガード）。

### 非機能要件
- [ ] NFR-097-01: WebVitals reporter 自体のサイズが gzip 後 5KB 以下であること。
- [ ] NFR-097-02: 計測コードが LCP / INP に影響しないこと（`requestIdleCallback` ベースの送信を使う）。
- [ ] NFR-097-03: GTM が無効な環境（`NEXT_PUBLIC_GTM_ID` 未設定）でクラッシュしないこと（`window.dataLayer` の存在チェック）。

