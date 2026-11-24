# REQ-092: Web アプリ軽量化（パフォーマンス最適化）包括要件

> 親 REQ。子 REQ（既存 / 新規）を束ねる「軽量化イニシアチブ」の総括ドキュメント。
> 既存子 REQ: REQ-010 / REQ-022 / REQ-026 / REQ-032 / REQ-041 / REQ-062
> 新規子 REQ（本書で提案）: REQ-093 〜 REQ-098

---

## これは何か

ザリダス（Next.js 15 App Router + React 19 + Supabase）の初回ロード時間・バンドルサイズ・
Core Web Vitals を改善するための**包括ロードマップ**。新規実装ではなく、既存 6 本の子 REQ を束ね、
足りない 6 本（REQ-093〜098）を追加する上位ドキュメント。

## 目的・背景の要約

- モバイル比率が高いのに、HomePage が全部 Client Component、投稿画像が生 `<img>`、
  ダッシュボード統計が 6〜7 並列クエリ、という三大ボトルネックで既存の最適化が相殺されている。
- First Load JS は `/` で約 232KB、`/admin/posts` で約 243KB（REQ-062 計測値）。
- 目的は「モバイルでの体感速度の底上げ」。インフラのプラン変更や CDN 移行は対象外。

## 主要な決定事項の要点

- **KPI**：LCP ≤ 2.5s / INP ≤ 200ms / CLS ≤ 0.1 / First Load JS（`/`）≤ 200KB gzip /
  Lighthouse Performance（mobile, `/`）≥ 85。
- **進め方は 5 フェーズ**：A 計測基盤 → B 速攻削減 → C クエリ/RSC 化 → D キャッシュと依存棚卸し → E 仕上げ。
- **最初に着手するのは P0（T-01〜T-03）**：bundle-analyzer 導入 / 本番 web-vitals → GA4 送信 /
  size-limit 閾値の引き締め。「数値を見る基盤」を先に整える。
- **フォント最適化は「変更しない」と明示**（FR-092-07）。以降の日本語 Web フォント追加提案を却下する根拠にする。
- 新規画面・新規 API・テーブル変更は無し。RPC（`get_dashboard_stats`）とインデックス追加のみ。
- 既存 RLS / CSP は弱めない。アクセシビリティ（WCAG 2.1 AA）を回帰させない。

## 目次（各部品）

- [01-overview-scope-preconditions.md](REQ-092-performance-optimization-overview/01-overview-scope-preconditions.md)
  — 1. 要件概要：背景・症状・目的、スコープ（対象 / 対象外）、前提条件・制約。
- [02-user-stories.md](REQ-092-performance-optimization-overview/02-user-stories.md)
  — 2. ユーザーストーリー US-001〜US-004（初訪問モバイル / 画像 CLS / ダッシュボード / CI 検知）と受け入れ条件。
- [03-fr-01-05-rsc-dynamic-image-query.md](REQ-092-performance-optimization-overview/03-fr-01-05-rsc-dynamic-image-query.md)
  — 3. 機能要件 FR-092-01〜05：HomePage の RSC 化、dynamic import 拡大、leaflet.heat 遅延化、画像最適化、Supabase クエリ最適化。
- [04-fr-06-11-treeshaking-cache-vitals.md](REQ-092-performance-optimization-overview/04-fr-06-11-treeshaking-cache-vitals.md)
  — 3. 機能要件 FR-092-06〜11：tree-shaking 強化、フォント、Next.js キャッシュ戦略、Server/Client 境界、Web Vitals 計測、バンドル分析。
- [05-nfr.md](REQ-092-performance-optimization-overview/05-nfr.md)
  — 4. 非機能要件：パフォーマンス KPI/SLO 表、セキュリティ、可用性、アクセシビリティ、レスポンシブ。
- [06-screens-and-api.md](REQ-092-performance-optimization-overview/06-screens-and-api.md)
  — 5. 画面仕様（SC-001〜004 の不変条件）と 6. API 仕様（`get_dashboard_stats` RPC、sitemap クエリ）。
- [07-data-model-and-migrations.md](REQ-092-performance-optimization-overview/07-data-model-and-migrations.md)
  — 7. データモデル・DB 設計（RPC 関数定義、インデックス追加候補）と 8. マイグレーション計画。
- [08-implementation-plan-and-checklist.md](REQ-092-performance-optimization-overview/08-implementation-plan-and-checklist.md)
  — 9. 実装計画（フェーズ A〜E / T-01〜T-19 の優先度・依存・見積）と 10. 現状分析チェックリスト。
- [09-kpi-risks-child-reqs.md](REQ-092-performance-optimization-overview/09-kpi-risks-child-reqs.md)
  — 11. 計測指標と KPI（サマリ表）、12. 想定リスクと対策、13. 子 REQ への分解（REQ-022〜098）。
- [10-next-actions-and-summary.md](REQ-092-performance-optimization-overview/10-next-actions-and-summary.md)
  — 14. 次のアクション（承認 → P0 → P1 → 子 REQ 展開）と全体サマリ。
