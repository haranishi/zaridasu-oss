# REQ-108: date-fns v2 → v3 アップグレード

> 親 REQ: REQ-092 / REQ-093（package-tree-shaking）

## 背景
ザリダスは `date-fns@^2.30.0` を 13 ファイルで使用している。v2 は CommonJS / ESM ハイブリッドのため tree-shaking 効率が低い。v3 は **ESM ネイティブ** + named export 単位で tree-shaking が効きやすく、Next.js の `experimental.optimizePackageImports`（REQ-093 で追加）と相性が良い。

REQ-093 で `optimizePackageImports: ['date-fns']` を追加済みだが、v2 のままだと効果が限定的。

## 現状の問題
- `package.json:24` — `"date-fns": "^2.30.0"`
- 利用ファイル 13 件（HomePage 系統 / DetailPage / SurveyRequestPage / MapView / dashboard / dateLocales / seo 等）
- v3 で API がほぼ互換だが、**locale import パスが変更**されている（`date-fns/locale` の named import → `date-fns/locale/ja` の direct import 推奨）
- `src/lib/dateLocales.ts` が locale 集約レイヤーになっているため、ここで吸収可能

## 目的
date-fns を v3 にアップグレードし、optimizePackageImports の効果を最大化、initial bundle JS を 5〜15KB 削減する。

## 要件

### 機能要件
- [ ] FR-108-01: `package.json` の `date-fns` を `^3` 系の最新（執筆時点 `^3.6` 想定）にアップグレード
- [ ] FR-108-02: `src/lib/dateLocales.ts` を v3 の locale import パスに対応（`import { ja } from 'date-fns/locale/ja'`）
- [ ] FR-108-03: 利用 13 ファイルで API 差分のあるもの（あれば）を修正：
  - `format` / `parseISO` / `differenceInDays` / `subMonths` 等の基本 API はほぼ互換
  - `formatDistanceToNow`, `formatRelative` の locale 引数の型は v3 で `Locale` 型に変わる場合あり
- [ ] FR-108-04: TypeScript 型エラー 0 で完走
- [ ] FR-108-05: 既存テスト（vitest）の date 系アサーションが pass

### 非機能要件
- [ ] NFR-108-01: First Load JS が **−5KB 以上** 縮むこと（gzip）
- [ ] NFR-108-02: 既存挙動（日付表示・タイムゾーン・i18n）が回帰しない
- [ ] NFR-108-03: vitest-axe テストが pass

## 受入条件
- [ ] AC-01: `package.json` の `date-fns` が `^3.x`
- [ ] AC-02: `npm run build` が成功
- [ ] AC-03: `npm test` が pass（特に日付フォーマット系のテスト）
- [ ] AC-04: bundle-analyzer の treemap で `date-fns` の合計サイズが現状から減っている
- [ ] AC-05: TrendsPage / DashboardPage / 投稿カードの日付表示が日本語ロケールで正しく出る
- [ ] AC-06: `getDateLocale(i18n.language)` が v3 でも正常に Locale を返す

## 影響範囲
- `package.json` / `package-lock.json`
- `src/lib/dateLocales.ts`
- 13 ファイル（`grep -rln "from 'date-fns'" src/` の全件）：
  - `src/hooks/useDetailSEO.ts`
  - `src/hooks/usePostList.ts`
  - `src/lib/seo.ts`
  - `src/app/area/[municipality]/AreaPageClient.tsx`
  - `src/components/features/dashboard/MyPostsSection.tsx`
  - `src/components/features/map/MapView.tsx`
  - `src/components/features/posts/CommentSection.tsx`
  - `src/components/features/posts/PhotoGallery.tsx`
  - `src/components/features/posts/PostCard.tsx`
  - `src/views/DetailPage.tsx`
  - `src/views/SurveyRequestPage.tsx`
  - `src/views/SurveyRequestsListPage.tsx`

## 優先度
- **緊急度**: Medium
- **重要度**: Medium
- **理由**: パフォーマンス改善 + 将来の保守性向上。v2 は EOL に向かっているので、いずれ必要。M 規模（半日〜1 日）、API 差分検証が必要なため独立 PR 推奨。

## 実装メモ
- `npm install date-fns@^3` 後にビルド → 型エラーが出る箇所を順に修正
- 主要な v3 差分：
  - `formatDistanceToNow(date, { locale: ja })` の locale プロパティ位置は同じだが Locale 型の構造が変わる
  - locale import: `import { ja } from 'date-fns/locale'` → `import { ja } from 'date-fns/locale/ja'`（v3 推奨）
  - `Locale` 型の export 位置：`import type { Locale } from 'date-fns'` で OK
- ロケール 1 箇所の修正で 13 ファイル全部が連動するため、`src/lib/dateLocales.ts` の更新が要 + 各ファイルは無修正の見込み
- 日付テストが多い箇所（vitest）を最初に走らせて差分検証
