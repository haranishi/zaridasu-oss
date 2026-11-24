> ⚠️ **アーカイブ（2026-07-18 / REQ-282 FR-282-B4）**: 歴史的文書（当時のスナップショット）。以後更新しない。現況は `docs/requirements/` の REQ 文書とインデックスを参照。

# ザリガニダス SEO 対策 要件定義書

> 作成日: 2026-03-14
> 対象URL: https://zaridasu.com/（正規ドメイン）/ https://zaridasu.vercel.app/（Vercel）
> 技術: React + Vite (SPA) / react-helmet-async / Supabase / Vercel

---

## これは何か

Next.js 移行前（React + Vite SPA 時代）の SEO 課題を洗い出し、
施策 SEO-001〜SEO-007 と優先度・KPI を定義した要件定義書。
本文が長いため以下の部品ファイルへ逐語で分割し、このファイルは入口（索引）とした。

## 目的・背景の要約

動的 title/description・OGP・Twitter Card・canonical・robots.txt・JSON-LD は既に実装済みで水準は高かったが、
🔴 **SPA クローラー問題**（JS 実行前提のため投稿詳細が事実上インデックスされていない可能性）と
🔴 **動的投稿が sitemap 未掲載**（`/post/:id` が sitemap.xml にない）が重大課題として残っていた。
ほかに 🟠 ドメイン不一致（canonical が zaridasu.com なのに実体は vercel.app）、
🟡 TrendsPage の noIndex と robots.txt の二重制御、og:image 最適化、hreflang 不在、Core Web Vitals を挙げている。

## 主要な決定事項の要点

- **最優先は 2 件**：SEO-001 SPA プリレンダリング（Edge Function、影響大・コスト大、2 週間以内）と
  SEO-002 動的サイトマップ（Supabase 連携、影響大・コスト中、1 週間以内）。
- **即時対応の 3 点**（コード数行）：HomePage の description からウチダザリガニ・ニホンザリガニを削除（SEO-006-fix）、
  robots.txt の `Disallow: /trends` を削除して noIndex 一本化（SEO-007-robots）、
  DetailPage の JSON-LD に BreadcrumbList を追加（SEO-004）。
- **将来送り（🔵）**：@vercel/og による動的 OGP 画像生成（SEO-005-p2）、Dataset スキーマ（SEO-004-dataset）。
- **計測**：Google Search Console・GA4・PageSpeed Insights を導入。
- **KPI（3 ヶ月後）**：インデックス済み 3〜5 → 50 ページ以上、オーガニック流入ほぼゼロ → 月 200 セッション、
  投稿詳細の Search impressions 0 → 500/月、投稿詳細の LCP 2.5 秒以内。

## 目次（部品ファイル）

| ファイル | 内容 |
|---|---|
| [01-current-analysis.md](requirements-seo/01-current-analysis.md) | 現状分析：既に実装されているものの一覧と、対処が必要な課題（深刻度付き） |
| [02-seo-001-prerendering.md](requirements-seo/02-seo-001-prerendering.md) | SEO-001 SPA プリレンダリング対応（最重要）：背景、ユーザーストーリー、実装方針の選択 |
| [03-seo-002-dynamic-sitemap.md](requirements-seo/03-seo-002-dynamic-sitemap.md) | SEO-002 動的サイトマップ（Supabase 連携）：実装設計と vercel.json への追記 |
| [04-seo-003-domain-canonical.md](requirements-seo/04-seo-003-domain-canonical.md) | SEO-003 ドメイン・Canonical 統一：背景、実装設計、環境変数の設定 |
| [05-seo-004-structured-data.md](requirements-seo/05-seo-004-structured-data.md) | SEO-004 構造化データの強化：追加するスキーマ（BreadcrumbList 等） |
| [06-seo-005-ogp-image.md](requirements-seo/06-seo-005-ogp-image.md) | SEO-005 OGP 画像の最適化：段階的な実装設計（種類別デフォルト → 動的生成） |
| [07-seo-006-keywords.md](requirements-seo/07-seo-006-keywords.md) | SEO-006 キーワード戦略：ターゲットキーワードとページ別 description 改善案 |
| [08-seo-007-technical-seo.md](requirements-seo/08-seo-007-technical-seo.md) | SEO-007 技術的 SEO：robots.txt の整理、hreflang タグ、Core Web Vitals 対策 |
| [09-priority-quick-wins-and-kpi.md](requirements-seo/09-priority-quick-wins-and-kpi.md) | 実装優先度マトリクス、即時対応可能な施策 3 点、測定・効果検証（計測ツールと KPI） |
