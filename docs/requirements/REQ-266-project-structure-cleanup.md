# REQ-266: プロジェクト構造の整理（app/views/components/hooks/lib の一貫化・純リファクタ）

> **本要件は「要件定義のみ」。実装（ファイル移動・リネーム）はユーザー承認まで行わない。** 挙動を変えない純リファクタで、可読性・保守性・オンボーディング速度を上げることが目的。
> 出所：2026-07-07 ユーザー依頼「フォルダの整理化。プロジェクトの構造が分かりにくくなってきた」。読み取り専用の構造調査（src/ 329ファイル）に基づく。

## 背景
機能実装が REQ-176〜251 まで進み、`src/` は tsx/ts 計 **329ファイル**に成長。この過程で「app=ルーティング／views=ページ実体」という設計意図が**半分しか守られておらず**、委譲パターンが5種類に分裂している。新機能追加ではなく、**構造の一貫性の欠如**が「どこに何があるか分からない」の主因。REQ-245（admin の `(protected)` 移行）の延長線上の整理。

## 現状の問題（調査根拠つき）

### 1. 薄い Client ラッパが大量＝3層インダイレクション（最優先）
中身が実質 `'use client'; export { default } from '@/views/...'` だけのファイルが8本前後：`app/collection/CollectionPageClient.tsx`(3行)・`dashboard/DashboardPageClient.tsx`・`ranking/RankingPageClient.tsx`・`trends/TrendsPageClient.tsx`・`offline/OfflinePageClient.tsx`・`about/AboutClient.tsx`・`auth/callback/AuthCallbackClient.tsx`・`admin/login/AdminLoginClient.tsx`。`page.tsx → *Client.tsx → views/*Page.tsx` の3段。一方 `/requests` や `admin/(protected)/*` は **page.tsx が直接 views を re-export**（2段）。**方針が不統一**。

### 2. app/ に実装本体が直置き（views/ 委譲ルールの破れ）
`app/(home)/HomeInteractive.tsx`(460行)・`app/area/[municipality]/AreaPageClient.tsx`(286行)・`app/dataset/page.tsx`(286行・全インライン)・`app/species/[species]/page.tsx`(186行・全インライン)・`app/u/unsubscribe/UnsubscribeClient.tsx`(145行)。「ルーティングは app、UIは views」の境界が崩れている。
- 派生：**孤児テスト** `views/__tests__/HomePage.test.tsx` があるのに `views/HomePage.tsx` は無く、本体は `app/(home)/HomeInteractive.tsx`。命名と置き場所が乖離。

### 3. admin 移行の残骸・命名非対称
`admin/(protected)/` への移行はほぼ完了（新 page.tsx は `views/admin/*` を re-export）だが、ダッシュボードだけ `views/admin/AdminDashboard.tsx`（他は `Admin*Page.tsx`）。layout が2枚（`app/admin/layout.tsx`→`AdminLayoutClient.tsx`→`views/admin/AdminLayout.tsx`(267行) ＋ `(protected)/layout.tsx` 認可ゲート）で階層が深い。

### 4. lib/ と utils/ の境界が曖昧
`src/utils/` は **3モジュールのみ**（`errorHandler.ts`/`maskIp.ts`/`storage.ts`）。同じ関心事が lib に分散：エラーは `utils/errorHandler.ts` ↔ `lib/errorReporter.ts`/`sentryReporter.ts`/`sentryScrub.ts`、ストレージは `utils/storage.ts` ↔ `lib/offlineStore.ts`/`uploadAudio.ts`、PII は `utils/maskIp.ts` ↔ `lib/sentryScrub.ts`。明文ルールなし。

### 5. components/ の分類の重複・揺れ
- `components/common/` が実質2ファイル（`OpenInGoogleMapsButton`/`WebVitalsReporter`）で ui/ との切り分け基準が不明。
- **重複**：`ui/StatCard.tsx` と `features/admin/AdminStatCard.tsx`。チャートが `ui/charts/{BarChart,DonutChart}` と `features/admin/{AreaChart,AdminDonutChart}` に散在（Donut が二重）。
- `modals/` の命名が3系統混在：`*Modal`（Auth/EditProfile/Map/Report）／`*Dialog`（Delete/DeletePost/Edit/Reject）／`*Form`（SurveyRequestForm）。

### 6. テスト配置のミスマッチ
`components/features/dashboard/__tests__/StatCard.test.tsx` が `ui/StatCard` を、同所の `BarChart/DonutChart.test.tsx` が `ui/charts/*` をテスト＝**ui/ のテストが features/dashboard/ 配下**。`src/__tests__` と `src/app/__tests__` の別建てなど粒度揺れ。

### 7. hooks/ が30ファイルのフラット
サブフォルダ無しで30フック（計4441行）。巨大：`usePostForm`(515)・`useAdminPosts`(486)・`useProfile`(364)。ドメインクラスタは明確（admin系4・posts系5・survey系3…）でサブフォルダ化の余地大。

### 8. 命名規則の揺れ
ラッパ接尾辞が `*PageClient`／`*Client`／`*Shell`+`*Interactive` で不統一。ページ実体の語尾も `*Page`／`HomeInteractive`／`AreaPageClient` とバラバラ。

## 目的
挙動・URL・DOM・i18n を一切変えずに、**「app=ルーティングのみ／views=ページ実体／委譲は1段／lib一本化／components分類明確／hooksドメイン別」** に統一し、追跡コストと新規参画コストを下げる。

## 要件（作業項目＝ウェーブ分割前提）

### 機能要件（＝リファクタ項目）
- [ ] FR-266-01 **委譲パターンの統一**：原則 `page.tsx` が直接 `views/*Page` を re-export（2段）。`'use client'` 境界が必要な箇所のみ最小ラッパを残し、その基準を `docs/` に明文化。薄い `*Client.tsx`（項目1の8本）を廃止 or 直 re-export 化。
- [ ] FR-266-02 **app 直置き本体を views へ移設**：`HomeInteractive`→`views/HomePage.tsx`（孤児テスト解消）、`area/[municipality]`・`species/[species]`・`dataset`・`u/unsubscribe` の UI 本体を `views/` へ。app 側は SSR/メタ/データ取得の薄い層に限定。
- [ ] FR-266-03 **admin 命名対称化**：`AdminDashboard`→`AdminDashboardPage` 等で `Admin*Page` に統一。layout 二枚重ねを整理（認可ゲートは維持）。
- [ ] FR-266-04 **utils/ を lib/ に統合**：3モジュールを関心事別に lib へ（例 `lib/errors/`・`lib/storage/`・`lib/pii/`）。`lib` と（廃止後の）配置基準をドキュメント化。
- [ ] FR-266-05 **components 整理**：`common/` 廃止（ui/ へ）、`StatCard`/チャート/`Donut` の重複を1つに統合、`modals/` を `Modal`/`Dialog` の2語彙に統一（`SurveyRequestForm` はフォームとして別扱いを明記）。
- [ ] FR-266-06 **テスト配置是正**：`ui/` コンポーネントのテストを対象コンポーネントの隣へ移動。`__tests__` の別建て粒度を揃える。
- [ ] FR-266-07 **hooks サブフォルダ化**：`hooks/{admin,posts,survey,auth,...}/` にドメイン別配置。バレル（`hooks/index.ts` 等）で `@/hooks/...` 参照を維持。
- [ ] FR-266-08 **命名規則ガイド**：ラッパ接尾辞・`Page`/`View` 語彙・Client 境界の規則を1つに決め `docs/` に記載（以後の逸脱を防ぐ）。

### 非機能要件
- [ ] NFR-266-01 **純リファクタ**：ランタイム挙動・公開URL・DOM 構造・i18n キー・バンドル構成（`crayfish3d` 等の split 含む）を変えない。
- [ ] NFR-266-02 各ウェーブ後に **type-check / lint(--max-warnings 0) / i18n:check / schema:check / test / build / size-limit** が全 green。
- [ ] NFR-266-03 import 変更は `@/` パスエイリアス前提＋バレルで最小化。1ウェーブ＝互いに素なグループで、レビュー可能な粒度（大量移動を1コミットに混ぜない）。
- [ ] NFR-266-04 git commit/push はユーザー指示があるまで行わない（既存方針）。**着手前提**：現ブランチ `feat/security-hardening` に大量の未コミット変更があるため、リファクタ着手時は**先に現作業を commit/別ブランチ化**して差分を分離すること（構造移動と機能差分の混在を避ける）。

### 受入条件
- [ ] AC-01 `app/` 配下に page/layout/route/loading/error 以外の実装本体が原則残らない（残す場合は理由をコメント）。
- [ ] AC-02 `views/HomePage.tsx` 新設で `views/__tests__/HomePage.test.tsx` の孤児が解消。
- [ ] AC-03 `src/utils/` が消滅（lib へ）。`components/common/` が消滅。重複コンポーネント（StatCard/Donut）が1つに。
- [ ] AC-04 `hooks/` がドメイン別サブフォルダ。`@/hooks/...` の外部参照は不変（バレル経由）。
- [ ] AC-05 全チェック green かつ主要フロー（投稿・地図・ランキング・admin・LP）に挙動差分なし。

## 影響範囲
`src/app` `src/views` `src/components` `src/hooks` `src/lib` `src/utils` と各テスト、`tsconfig`（paths）。関連 REQ：REQ-245（admin移行）／REQ-246（Database型付け）／REQ-155（残キャスト15箇所は本整理と同時に減らせる余地）。

## 優先度
- **緊急度**: Low ／ **重要度**: Medium〜High
- **理由**：機能不全ではないが、今後の要件（REQ-252〜265 等）の実装速度・レビュー容易性・オンボーディングに直接効く「効いてくる」投資。**段階導入必須**（1回で全面改修しない）。発表準備（9月）と競合しない時期にウェーブ実行するのが安全。
