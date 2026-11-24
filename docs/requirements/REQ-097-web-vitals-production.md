# REQ-097: 本番 Web Vitals 計測（GA4 連携）

> 親 REQ: REQ-092（Web アプリ軽量化包括要件）

## これは何か

本番ユーザーの Core Web Vitals を `web-vitals` ライブラリで収集し、GTM 経由で GA4 のカスタムイベントとして送る要件。全文は同名ディレクトリの部品ファイルへ逐語で分割してある（入口のみ新規要約）。

## 目的・背景の要約

パフォーマンス計測が CI 上の Lighthouse（REQ-062）だけに依存しており、本番環境のフィールドデータが無い。Lighthouse は合成計測で、実ユーザー（モバイル / 4G / バックグラウンドタブ / Service Worker キャッシュ状態）の挙動を反映しない。Google が SEO に使うのは CrUX のフィールドデータであり、これに対応するには本番から `web-vitals` で送る方式しかない。LCP / INP / CLS / TTFB / FCP を GA4 へ送り、SLO 監視とリグレッション検知の根拠データにする。

## 主要な決定事項の要点

- 送信経路は `window.dataLayer.push({ event: 'web_vital', ... })`。GTM コンテナ設定はリポジトリ管理外のため、GA4 へのフォワード手順は `docs/runbooks/web-vitals-setup.md` に手順書として残す。
- `metric_rating`（good / needs-improvement / poor）も同送する。値の丸めは CLS が小数 4 桁、それ以外は整数（ミリ秒）。
- ローカル / プレビューでは送信しない（`NODE_ENV === 'production'` ガード）。`NEXT_PUBLIC_GTM_ID` 未設定でもクラッシュしないよう `window.dataLayer` の存在を確認する。
- 計測コード自体が LCP / INP に影響しないよう `requestIdleCallback` ベースで送信し、gzip 後 5KB 以下に収める。
- CSP の `script-src` 変更は不要（既存 GTM 設定で完結）。
- 緊急度・重要度とも High。REQ-092 の KPI（LCP ≤ 2.5s / INP ≤ 200ms / CLS ≤ 0.1）を本番値で観測する前提であり、これが無いと改善の効果証明ができない。

## 部品ファイル

| ファイル | 内容 |
|---|---|
| [01-background-and-requirements.md](REQ-097-web-vitals-production/01-background-and-requirements.md) | 背景（合成計測とフィールドデータの違い）、現状の問題、目的、機能要件 FR-097-01〜07、非機能要件 NFR-097-01〜03 |
| [02-acceptance-impact-and-priority.md](REQ-097-web-vitals-production/02-acceptance-impact-and-priority.md) | 受入条件 AC-01〜06、影響範囲、優先度の判断 |
| [03-implementation-notes.md](REQ-097-web-vitals-production/03-implementation-notes.md) | 実装メモ。`WebVitalsReporter.tsx` のコード例、GA4 側の探索レポート集計手順、CSP に関する注意 |
