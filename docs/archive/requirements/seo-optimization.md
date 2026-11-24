> ⚠️ **アーカイブ（2026-07-18 / REQ-282）**: 当時のSEO最適化計画。後継は REQ-275（SEO整合）/ REQ-276（動的OG・manifest）。

# SEO最適化 要件定義書

## これは何か

ザリダス（秋田県外来生物情報マップ）の SEO 最適化計画をまとめた当時の要件定義書。長いためセクション境界で分割し、本文は `seo-optimization/` 配下へ逐語で移した。この入口ファイルは要点と部品への index のみを持つ。

## 目的・背景の要約

メタタグ・OGP・動的サイトマップ・robots.txt・JSON-LD・canonical・PWA マニフェスト・ISR といった基本的な SEO 対策は実装済みという前提のうえで、さらに検索順位向上・CTR 改善・コンテンツ SEO 強化を狙うのが本書の目的。対象はコンテンツ SEO（地域×種別ランディングページ）、構造化データ拡充、Core Web Vitals、内部リンク構造、パンくずの視覚表示、ページ単位のメタ情報最適化。

## 主要な決定事項（要点）

- 機能要件は FR-001〜FR-008。中核は **地域×種別ランディングページ（`/area/[municipality]` と `/area/[municipality]/[species]`）** の生成で、ロングテールキーワードからの流入獲得を狙う。
- 実装優先度は **P1: Core Web Vitals・パンくずナビ・構造化データ拡充・Google Search Console 連携** → **P2: DB マイグレーション → 地域別ページ → 内部リンク → Open Search** → **P3: 動的 OGP 画像生成・hreflang（i18n 完了後）**。
- DB は `municipalities` テーブルを新規作成（Migration-001）し、`posts` にインデックスを追加（Migration-002）する。
- 期待効果としてオーガニック流入 2〜3 倍増、リッチスニペットによる CTR 向上、地域キーワードでの上位表示を置いた。

## 分割ファイル

- [01-overview.md](seo-optimization/01-overview.md) — 要件概要（背景・目的／実装済みの現状／スコープ／前提条件・制約）
- [02-user-stories.md](seo-optimization/02-user-stories.md) — US-001 検索流入／US-002 SNS シェア表示／US-003 サイト内ナビ／US-004 表示速度
- [03-functional-requirements-fr-001-006.md](seo-optimization/03-functional-requirements-fr-001-006.md) — FR-001 地域×種別 LP 生成／FR-002 パンくず／FR-003 構造化データ／FR-004 Core Web Vitals／FR-005 内部リンク／FR-006 Open Search
- [04-fr-007-008-and-nonfunctional.md](seo-optimization/04-fr-007-008-and-nonfunctional.md) — FR-007 Search Console 連携／FR-008 動的 OGP 画像生成と非機能要件
- [05-screen-specs.md](seo-optimization/05-screen-specs.md) — 画面仕様 SC-001 地域別ランディングページ／SC-002 地域×種別 詳細ページ
- [06-api-specs.md](seo-optimization/06-api-specs.md) — API-001 地域別投稿取得／API-002 動的 OGP 画像生成／API-003 Open Search Description
- [07-data-model.md](seo-optimization/07-data-model.md) — データモデル・DB 設計（`posts` の変更と `municipalities` の新規追加）
- [08-migration-plan.md](seo-optimization/08-migration-plan.md) — Migration-001 municipalities 作成／Migration-002 posts インデックス追加
- [09-implementation-plan-and-summary.md](seo-optimization/09-implementation-plan-and-summary.md) — 実装計画（優先度表）とサマリー・期待効果・次のアクション
