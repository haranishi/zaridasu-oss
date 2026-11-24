## 要件概要

### 背景・目的
- ザリダス（秋田県外来生物情報マップ）の検索エンジンからの流入を増やし、より多くのユーザーに外来生物情報を届ける
- 現状、基本的なSEO対策（メタタグ、OGP、sitemap、robots.txt、JSON-LD）は実装済み
- さらなる検索順位向上・CTR改善・コンテンツSEO強化を目指す

### 現状の実装状況（実装済み）
- ✅ Next.js Metadata API によるメタタグ設定
- ✅ OpenGraph / Twitter Card 設定
- ✅ 動的サイトマップ生成（投稿・調査依頼・プロフィール）
- ✅ robots.txt（管理画面ブロック済み）
- ✅ JSON-LD 構造化データ（WebSite, WebApplication, Report, BreadcrumbList）
- ✅ canonical URL 設定
- ✅ PWA マニフェスト
- ✅ ISR（トレンド・ランキングページ）
- ✅ Google Analytics 対応準備

### スコープ
**今回対象：**
- コンテンツSEO強化（地域×種別ランディングページ）
- 構造化データ拡充（FAQPage, Event, LocalBusiness 等）
- Core Web Vitals 最適化
- 内部リンク構造の改善
- パンくずナビゲーションの視覚的表示
- ページ単位のメタ情報最適化
- Google Search Console 連携
- hreflang 対応（i18n 基盤活用）
- Open Search 対応

**対象外：**
- 外部リンク獲得（リンクビルディング）
- 有料広告（Google Ads 等）
- SNSマーケティング施策（OGP設定は対象内）

### 前提条件・制約
- Next.js 15 App Router + Server Components を前提
- Supabase をデータソースとして利用
- Vercel ホスティング（エッジ最適化可能）
- 日本語コンテンツが主（i18n 基盤は存在）

---
