### 問題A: Sentry ブラウザ SDK 49.0 kB(gzip) が全ルートの初期バンドルに常駐 — High

`src/instrumentation-client.ts:13`（`import * as Sentry from '@sentry/nextjs'`）と `src/app/global-error.tsx:4` がいずれも**静的 import** のため、Sentry ブラウザ SDK が共有チャンクに入り全ルートの First Load JS に常駐する。

- チャンク `.next/static/chunks/9898-543fd71ed895944f.js` 全体 = **401 kB raw / 120.9 kB gzip（226 モジュール）**。このうち Sentry マーカー（`sentry-trace` / `baggage` / `traceparent` / `sdkProcessingMetadata` / `dsn` / `mechanism`）を含む **23 モジュール = 147.8 kB raw / 49.0 kB gzip**。残りは Next.js app-router ランタイム。
- Session Replay は入っていない（`rrweb` の出現 0 件＝ `instrumentation-client.ts:27` の `replaysSessionSampleRate: 0` が効いている）。一方 `instrumentation-client.ts:24` の `tracesSampleRate: 0.1` により **tracing / performance 一式が同梱**されている。

影響が最も大きいのは広告着地想定の **/lp** で、First Load JS 214.6 kB のうちチャンク 9898 が **120.9 kB = 56.3%** を占める。/lp には Supabase・ja 翻訳・Leaflet がいずれも含まれておらず（設計は正しい）、それでも半分以上が**エラー追跡 SDK とフレームワークランタイム**になっている。モバイル 4G では TBT / TTI に直結する。

**対応は選択肢があり、判断が必要**（本REQでは選択肢と判断材料を提示し、実装時に決める）。

| 案 | 内容 | 得られるもの | 失うもの／リスク |
|---|---|---|---|
| ① tracing 撤去 | `tracesSampleRate: 0.1` を削除（`beforeSendTransaction` も不要になる） | クライアント側で最も重い任意部分を落とせる。エラー収集のみなら機能的に不要 | パフォーマンストレース（本番の遅延調査手段）を失う。ただし Web Vitals 計測（`providers.tsx:111`→`trackEvent('web_vital')`→GA4）は別経路で生きているため実質の損失は小さい |
| ② 遅延初期化 | 最小コアのみ即時 init、integration は `lazyLoadIntegration` / 動的 import へ | 初期バンドルから大部分を外せる | **ハイドレーション前のエラーを取りこぼす**（初期化前に発生した例外は送られない）。エラー追跡の目的と正面から衝突するため、取りこぼし許容範囲の合意が必要 |
| ③ /lp のみ Sentry を切る | LP ルートでは SDK を読み込まない | /lp が **-49.0 kB**（214.6 → 165.6 kB＝ -22.8%） | LP のクラッシュを検知できなくなる。LP は静的寄りで依存が少ないため許容しやすいが、コンバージョン導線の障害を見逃すリスクは残る |
| ④ 内訳の再確認 | `ANALYZE=true npm run build`（= `npm run analyze`）で 9898 の正確な内訳を確定 | ①〜③の効果を実測で見積もれる | なし（**①〜③の判断より先に実施すべき**） |
