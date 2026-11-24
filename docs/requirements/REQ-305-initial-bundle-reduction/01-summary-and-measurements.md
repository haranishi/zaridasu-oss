作成日: 2026-07-30
優先度: **P1** ／ 深刻度: **High** ／ 種別: 性能（バンドル）
状態: **提案 / 未実装**
関連: REQ-278（フロントエンド性能改善）, REQ-213（perf-budget / NFR-213-01 zod 非混入）, REQ-145（多言語の遅延ロード）, REQ-209（named import / deep import）, REQ-306（性能予算の実効化＝**本REQの前提整備**）, REQ-026（Leaflet CSS の集約先）

> [!important] 実施順序
> 本REQの削減は **REQ-306（size-limit の監視範囲拡張・LHCI モバイル計測）を先に入れてから**着手する。
> 現行 CI は「/ の 332.2 kB のうち 9.3 kB（2.8%）」しか監視していないため、本REQで削っても**戻ったときに検知できない**。

## 背景

2026-07-30 に develop 89495e9 のビルド成果物（`.next/app-build-manifest.json` ＋各チャンクの実 gzip 圧縮）で計測した実測値。

### ルート別 First Load JS（gzip 実測）

| ルート | First Load JS |
|---|---|
| /dashboard | **347.1 kB** |
| /collection | **335.1 kB** |
| / (home) | **332.2 kB** |
| /post/[id] | **330.6 kB** |
| /trends | **305.4 kB** |
| /ranking | **305.3 kB** |
| /lp | **214.6 kB** |

### / (home) 332.2 kB の内訳（gzip 実測）

| 内容 | チャンク | gzip | 本REQでの扱い |
|---|---|---|---|
| Sentry ＋ Next.js app-router ランタイム（共有） | 9898 | **120.9 kB**（うち Sentry **49.0 kB**） | 問題A |
| React 系 | 4bd1b696 | 53.2 kB | 対象外 |
| Supabase | 6962 | 52.4 kB | 対象外 |
| ja 翻訳 | 4600 | **22.0 kB** | 問題D |
| i18next | 5662 | 20.0 kB | 対象外 |
| zod | 5653 | **16.5 kB** | 問題B |
| ルート固有 | `app/(home)/page-*.js` | 9.1 kB | 対象外 |

JS の削減余地は **Sentry 49.0 kB ＋ zod 16.5 kB ＝ 65.5 kB gzip**（主要ルート共通）に、ja 翻訳の namespace 分割分（問題D）が加わる。加えて CSS が 14.8 kB raw（問題C）、リポジトリ／SW キャッシュが約 800 kB（問題E）。

なお **three.js / @react-three/fiber（crayfish3d 233.9/250 kB）・Leaflet JS・cluster・leaflet.heat の遅延分割は完全**で、いずれも全ルートの初期チャンクに含まれない（監査で確認済み）。本REQは「すでに分割されている領域」ではなく「分割されずに常駐している領域」だけを扱う。

---
