# REQ-013: スキップリンクの整合性改善

## 背景
キーボード操作やスクリーンリーダーを使用するユーザーは、ページ読み込みのたびに Header・FilterBar 等のナビゲーション要素を Tab で通過する必要がある。WCAG 2.1 Success Criterion 2.4.1「Bypass Blocks」では、繰り返されるコンテンツブロックをスキップする手段の提供が求められている。

## 現状の問題
- `src/components/layout/Header.tsx`（102-107行目）に `<a href="#main-content">` スキップリンクが実装済み
- しかし、スキップ先の `id="main-content"` は `src/views/HomePage.tsx`（229行目）にしか存在しない
- `DetailPage.tsx`、`TrendsPage.tsx`、`AboutPage.tsx`、`RankingPage.tsx`、`DashboardPage.tsx` など Header を使用する他の全ページに `id="main-content"` のランドマークが存在しない
- これらのページでスキップリンクをクリックしても、ブラウザはターゲットを見つけられずスクロール・フォーカス移動が発生しない（スキップリンクが実質無効）
- `sr-only focus:not-sr-only` のスタイルは適切だが、フォーカス時の視認性（コントラスト比、位置）の検証が不十分

## 目的
すべてのページでスキップリンクが正しく機能し、キーボードユーザーがナビゲーションをバイパスしてメインコンテンツに即座にアクセスできるようにする。

## 要件

### 機能要件
- [ ] FR-013-01: Header を使用するすべてのページビュー（DetailPage, TrendsPage, AboutPage, RankingPage, DashboardPage, ProfilePage, TermsPage, PrivacyPage, SurveyRequestPage, OfflinePage, NotFoundPage）のメインコンテンツ領域に `id="main-content"` を付与する
- [ ] FR-013-02: 共通レイアウト（`src/app/layout.tsx` など）で `<main id="main-content">` を配置し、各ページで個別に `id` を付与する必要をなくす方法を検討する
- [ ] FR-013-03: スキップリンクのフォーカス時に、ユーザーが視認できる十分なコントラスト比（4.5:1以上）とサイズで表示されることを確認する
- [ ] FR-013-04: スキップリンクのクリック後、`#main-content` 要素にフォーカスが移動することを確認する（必要に応じて `tabindex="-1"` を付与）

### 非機能要件
- [ ] NFR-013-01: WCAG 2.1 Level A（SC 2.4.1 Bypass Blocks）準拠
- [ ] NFR-013-02: 既存の視覚レイアウトに影響を与えない（スキップリンクは通常時 `sr-only`）

## 受入条件
- [ ] AC-01: すべてのページで Tab キー押下時にスキップリンクがフォーカスされ、画面上に表示される
- [ ] AC-02: スキップリンクを Enter で実行すると、メインコンテンツ領域にフォーカスが移動する
- [ ] AC-03: Header を使用する全ページ（少なくとも12ページ）で `id="main-content"` ターゲットが存在する
- [ ] AC-04: VoiceOver / NVDA でスキップリンクが正しくアナウンスされる

## 影響範囲
- `src/components/layout/Header.tsx`（既存スキップリンクの検証・調整）
- `src/views/HomePage.tsx`（既存 `id="main-content"` の確認）
- `src/views/DetailPage.tsx`（`id="main-content"` 追加）
- `src/views/TrendsPage.tsx`（`id="main-content"` 追加）
- `src/views/AboutPage.tsx`（`id="main-content"` 追加）
- `src/views/RankingPage.tsx`（`id="main-content"` 追加）
- `src/views/DashboardPage.tsx`（`id="main-content"` 追加）
- `src/views/ProfilePage.tsx`（`id="main-content"` 追加）
- `src/views/TermsPage.tsx`（`id="main-content"` 追加）
- `src/views/PrivacyPage.tsx`（`id="main-content"` 追加）
- `src/views/SurveyRequestPage.tsx`（`id="main-content"` 追加）
- `src/views/OfflinePage.tsx`（`id="main-content"` 追加）
- `src/views/NotFoundPage.tsx`（`id="main-content"` 追加）
- または `src/app/layout.tsx` 等の共通レイアウトで一括対応

## 優先度
- **緊急度**: Medium
- **重要度**: High
- **理由**: WCAG 2.1 Level A 必須要件であり、キーボードユーザーの基本的なナビゲーションに影響する。現状 HomePage では動作するが、他の全ページで機能しておらずアクセシビリティ上の欠陥がある。
