# REQ-141: 静的ページの Server Component 化（About / Terms / Privacy ほか）

> 関連 REQ: REQ-026（map bundle 最適化）/ REQ-037（RSC Supabase client 統一）/ REQ-101（HomeShell 切り出し）/ REQ-124（First Load JS バジェット）

## 背景
Next.js 15 App Router に移行済みだが、`src/views/*.tsx` の大半が `'use client'` で宣言され、`src/app/<route>/page.tsx` は単に `*PageClient.tsx` をマウントする薄いラッパになっている。
HomeShell（REQ-101）で RSC 境界を切り出したのは Home のみで、ほぼ静的な About / Terms / Privacy / SurveyRequestsList などまで Client 全振りになっており、不要な JS bundle が First Load に乗っている。
特に `/terms` `/privacy` は法務文書を表示するだけで、`useTheme` 程度しかインタラクティブ要素が無いにも関わらず全文 Client。

## 現状の問題
- `src/app/about/AboutPageClient.tsx:1-3`：`'use client'` + `export { default } from '@/views/AboutPage'` の薄いラッパで、AboutPage 本体（289 行）が丸ごと Client。
- `src/app/terms/page.tsx:13` → `TermsPageClient` → `@/views/TermsPage`（60 行、ほぼ静的 HTML）が `'use client'`。
- `src/app/privacy/page.tsx:13` → 同上（72 行、ほぼ静的）。
- `src/views/TermsPage.tsx:6` / `src/views/PrivacyPage.tsx:6` のインタラクティブ要素は `useTheme()`（ダークモード切替）のみで、それも CSS variable / data-attribute ベースに置き換え可能。
- `src/views/SurveyRequestsListPage.tsx` は 270 行で、useState / useEffect / フォーム入力ありの本格 Client だが、トップの一覧表示部分は RSC 化余地あり。
- `src/views/RankingPage.tsx` 164 行も `'use client'` で全振り。RSC + 部分 hydration の好機。
- 結果として `/about` `/terms` `/privacy` の First Load JS に i18n / lucide-react / theme context など不要な依存が乗り、ユーザーがそれらのページに直接ランディングしたときの LCP が悪化している。

## 目的
- 「ほぼ静的なページ」は RSC を主体とし、`'use client'` の使用を「真にインタラクティブな子コンポーネント」のみに局所化する。
- First Load JS を削減し、LCP / TBT を改善する。
- `generateMetadata` / RSC でのデータ取得を活かせるベースラインを整える。

## 要件

### 機能要件
- [ ] FR-141-01: `/about` を RSC 主体に書き直す。
  - `src/app/about/page.tsx` を Server Component のまま、本体描画も RSC で行う（薄い `AboutPageClient` ラッパは廃止 or 縮小）。
  - i18n が必要な部分は `getTranslations()` 相当（または静的辞書）でサーバー側翻訳に切り替える。動的言語切替が必要なら最小の Client island に分離。
  - FAQ JSON-LD は現状どおり RSC で `<script type="application/ld+json">` として出力。
- [ ] FR-141-02: `/terms` を RSC 化。
  - `useTheme()` は `data-theme` 属性 + CSS variable で SSR に対応した形に置き換える（または Theme 切替トグルだけを `<ThemeToggle />` Client component に分離）。
  - `<Link>` は RSC でもそのまま使えるため変更不要。
- [ ] FR-141-03: `/privacy` を RSC 化（FR-141-02 と同じ方針）。
- [ ] FR-141-04: `useTheme` の SSR 対応：
  - サーバーで `cookies()` / `headers()` から theme を読んで `<html data-theme="dark">` をレンダーする。
  - クライアントの ThemeContext は CSS variable / data-attribute と同期する形に縮退し、`'use client'` のスコープを削減する。
  - もしくは、当該静的ページではあえて theme context を排し、Tailwind の `dark:` クラスを CSS-only で機能させる選択肢を検証する。
- [ ] FR-141-05: 各 page.tsx の `export const dynamic = 'force-static'` は維持し、ビルド時に HTML を生成する。
- [ ] FR-141-06:（任意）`/ranking` を Server Component 化検討：トップ N の取得は RSC で実行し、フィルタ UI のみ Client に分離する PoC を 1 つ行う（実装は別 REQ でも可）。
- [ ] FR-141-07: 既存 `*PageClient.tsx` の薄いラッパは、本 REQ で RSC 化した route から削除する。

### 非機能要件
- [ ] NFR-141-01: `/about` `/terms` `/privacy` の First Load JS が現状比で **30 KB 以上** 削減される（`npm run build` の出力で確認）。
- [ ] NFR-141-02: Lighthouse モバイル `/terms` `/privacy` の Performance スコアが +5 以上、LCP が -200ms 以上改善。
- [ ] NFR-141-03: ダークモードの初回表示で「白フラッシュ」（Theme hydration mismatch）が発生しない。
- [ ] NFR-141-04: i18n 表示が壊れない（日本語/英語の切替が静的ページでも従来同等に機能する）。

## 受入条件
- [ ] AC-01: `view-source:/terms` を確認し、本文 HTML がインラインで含まれている（Client hydration 前から完全に読める）。
- [ ] AC-02: ブラウザの DevTools Coverage で `/terms` `/privacy` の JS の Unused 率が現状より下がる。
- [ ] AC-03: `npm run build` の Route (App) Size 列で、`/about` `/terms` `/privacy` の First Load JS が削減されている。
- [ ] AC-04: ダークモードの切替（Header の toggle）が静的ページ含めて回帰しない。
- [ ] AC-05: 日本語 / 英語の切替が静的ページで現状どおり機能する。
- [ ] AC-06: `npm run typecheck` / `npm test` / `npm run lint` が pass。

## テスト要件
- [ ] T-141-01: Playwright（E2E）: `/terms` `/privacy` にアクセスし、JS 実行をブロックした状態で本文 H1 / H2 / 主要文章が見えることを確認（`page.context().route` で JS をブロック、または `javascript:disabled`）。
- [ ] T-141-02: Playwright（E2E）: ダークモード ON / OFF を Cookie に仕込んだ状態で `/terms` を SSR 取得 → `data-theme="dark"` が初期 HTML に含まれる。
- [ ] T-141-03: Vitest（snapshot）: AboutPage（RSC 化後）の React Server Component を `@testing-library/react` の `renderToStaticMarkup` 相当でレンダーし、FAQ JSON-LD が含まれている。
- [ ] T-141-04: `npm run build` 出力（`.next/build-manifest.json` / route size）を CI で記録し、対象ルートの First Load JS が予算（NFR-141-01）以内であることを確認するスクリプトを追加。
- [ ] T-141-05: 既存 i18n 関連テストが pass。

## 影響範囲
- `src/app/about/page.tsx` / `AboutPageClient.tsx`（撤廃）
- `src/app/terms/page.tsx` / `TermsPageClient.tsx`（撤廃）
- `src/app/privacy/page.tsx` / `PrivacyPageClient.tsx`（撤廃）
- `src/views/AboutPage.tsx`（RSC へ書き換え、または `app/about/page.tsx` に直接インライン化）
- `src/views/TermsPage.tsx` / `src/views/PrivacyPage.tsx`（同上）
- `src/context/ThemeContext.tsx`（cookies/headers ベースの初期化対応）
- `src/components/common/ThemeToggle.tsx`（新設または既存 toggle の局所化）
- `i18n` 関連（`src/lib/i18n*` / `src/locales`）：サーバー側翻訳の経路追加
- （任意）`src/app/ranking/page.tsx` / `src/views/RankingPage.tsx`

## 優先度
- **緊急度**: High
- **重要度**: High
- **理由**: バンドル削減と LCP 改善はコアウェブバイタル直結。法務ページは検索流入が少なくないため SSR HTML の質が SEO に効く。REQ-124（First Load JS バジェット）達成のための前提作業。

## 実装メモ
- まず最も静的な `/terms` `/privacy` の 1 ファイルから着手すると低リスク。動いた段階で `/about` `/ranking` に展開。
- i18n をサーバー側でやるには `react-i18next` ではなく、別途 `getRequestLocale()` 的なヘルパーで JSON 辞書を読む方式が無難。完全移行が重ければ、静的ページだけ簡易辞書（or 静的文字列 + dynamic island）に切り出すアプローチも可。
- `useTheme` の Cookie 化は REQ-101 系のフォローアップに該当する可能性があるため、既存 PR / 既存設計と整合性を取る。
- 段階リリース：1) `/terms` `/privacy` の RSC 化 → 2) ダークモード Cookie 同期 → 3) `/about` の i18n 含め RSC 化 → 4) `/ranking` PoC。
