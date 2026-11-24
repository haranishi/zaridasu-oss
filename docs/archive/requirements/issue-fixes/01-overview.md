## 要件概要

### 背景・目的

ザリダス（秋田県ザリガニ分布マップ）は Vite SPA → Next.js 15 App Router への移行途中であり、
移行作業と並行して蓄積した技術的負債・セキュリティ課題・品質課題を一括解消する。

**解決したい課題:**
- APIキーのgit履歴露出によるセキュリティリスク
- Admin権限のサーバーサイド検証不足
- ビルド不能状態（vitest.config.ts プラグイン不整合）
- テスト19件失敗・TypeScriptエラー9件
- メモリリーク・パフォーマンス問題
- アクセシビリティ・エラーハンドリングの欠如
- 未コミットの移行ファイル群

### スコープ

**対象:**
- セキュリティ修正（環境変数・Admin権限・GA ID・i18n）
- ビルド・テスト修正（vitest設定・テスト修正・TS修正・ESLint）
- パフォーマンス改善（メモリリーク・無限スクロール上限・アイコンキャッシュ）
- アクセシビリティ改善（alt属性・フォーカス管理）
- エラーハンドリング改善（ジオコーディング・天気API・位置情報）
- Git管理整理（移行コミット・Vite残存物削除）

**対象外:**
- 新機能の追加
- UIデザインの変更
- DB スキーマの変更
- Supabase Edge Function の変更

### 前提条件・制約

- **技術スタック:** Next.js 15.3.4 / React 19.1.0 / TypeScript 5.9.3 / Supabase / Tailwind CSS 3.3.5
- **ホスティング:** Vercel（https://zaridasu.com）
- **テスト:** Vitest 4.0.18 + Testing Library
- **既存RLS:** Supabase Row Level Security は schema.sql で設定済み
- **Admin判定:** `user.app_metadata.role === 'admin'`（Supabase側で設定）

---
