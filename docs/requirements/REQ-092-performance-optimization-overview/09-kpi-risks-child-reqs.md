## 11. 計測指標と KPI（再掲・サマリ）

| 指標 | 現状 | 目標 | 採点方法 |
|---|---|---|---|
| LCP（mobile, /） | ~3.0s | ≤ 2.5s | lhci + 本番 web-vitals 中央値 |
| INP（mobile, /） | TBD | ≤ 200ms | 本番 web-vitals |
| CLS（mobile, /） | TBD | ≤ 0.1 | lhci + 本番 web-vitals |
| First Load JS（/） | ~232KB | ≤ 200KB | size-limit |
| First Load JS（/admin/posts） | ~243KB | ≤ 220KB | size-limit |
| Lighthouse Perf（mobile, /） | ~80 | ≥ 85 | lhci |
| ダッシュボード初期クエリ数 | 6〜7 | 1〜2 | コードレビュー + ネットワークタブ |
| `<img>` 直書き件数 | TBD | 0 | grep |
| `'use client'` 件数 | 94 | 不要分削減 | grep |

---

## 12. 想定リスクと対策

| リスク | 影響 | 対策 |
|---|---|---|
| dynamic import 過多で初回操作時のラグ増 | UX 悪化 | スケルトン必須化 / preload 戦略 |
| RSC 化で SSR 時に Supabase に過剰アクセス | TTFB 悪化 | 集約 RPC + Vercel Edge キャッシュ |
| date-fns v3 移行で API 差異 | バグ | `dateLocales.ts` でアダプタ層、テスト前提 |
| optimizePackageImports が一部 lib で壊れる | ビルド失敗 | カナリア対象を絞る + ロールバック容易化 |
| Service Worker キャッシュで効果が見えない | 計測歪み | 計測時 SW unregister を runbook 化 |

---

## 13. 子 REQ への分解（推奨）

本 REQ は包括ロードマップ。実装時は以下の粒度で子 REQ を起票：

| ID | タイトル | 由来 |
|---|---|---|
| REQ-022 | 画像最適化（next/image） | 既存 |
| REQ-026 | 地図関連バンドル最適化 | 既存 |
| REQ-032 | データ取得効率化 / sitemap | 既存 |
| REQ-041 | EditDialog 画像最適化 | 既存 |
| REQ-062 | size-limit / Lighthouse CI | 既存 |
| REQ-093 | パッケージ tree-shaking 強化（FR-092-06） | **新規** |
| REQ-094 | フォント最適化レビュー（FR-092-07） | **新規（変更なしの判断記録用）** |
| REQ-095 | Next.js キャッシュ戦略整備（FR-092-08） | **新規** |
| REQ-096 | Server/Client 境界見直し（FR-092-09） | **新規** |
| REQ-097 | 本番 Web Vitals 計測（FR-092-10） | **新規** |
| REQ-098 | バンドル分析の常設（FR-092-11） | **新規** |

> 子 REQ-093〜098 は本書承認後に `/gen-requirements` で展開可能。

---
