# REQ-187: main ランドマークの入れ子と重複の解消

## 背景
ザリダスのルートレイアウト `src/app/layout.tsx`（145行）は、全ページの `children` を `<main id="main-content">` で包んでいる:

```tsx
<Providers><main id="main-content">{children}</main></Providers>
```

一方、一部のページコンポーネントは自前で `<main>` を描画しており、レイアウトの `<main>` の内側にもう一つ `<main>` が入る「入れ子の main」が発生している:
- `src/views/LandingPage.tsx`（44行）: ルート `<div>`（38行）の内側に `<LpHeader>`（43行 → `<header>` 213行）・`<main>`（44〜53行）・`<footer>`（54行）を描画。
- `src/views/admin/AdminLayout.tsx`（212行）: コンテンツ領域に `<main className="flex-1 p-4 ...">`（212〜214行）を描画。

これらのページは最終的にレイアウトの `<main id="main-content">` の内側にレンダリングされるため、`main > main` という構造になる。

HTML 仕様（WHATWG）では、`<main>` 要素はフロー上に同時に複数可視であってはならず、入れ子も認められていない。ARIA でも `main` ランドマークはページに 1 つが原則であり、複数あるとスクリーンリーダーのランドマークナビゲーションで「どれが本文か」が曖昧になる。

加えて LP では、`<header>`（213行）と `<footer>`（54行）が**レイアウトの `<main>` の内部**に位置するため、ブラウザの暗黙のランドマークマッピング規則（`banner` / `contentinfo` ロールは `main` 等のセクショニング要素の内側では付与されない）により `banner` / `contentinfo` ロールが付かない。これは REQ-176 のランドマーク要件 **NFR-176-07** が未達であることを意味する。

WCAG 2.1 の以下に関連する:
- **1.3.1 情報及び関係性（レベル A）**: ページ構造（ランドマーク）をプログラム的に正しく提供すべき。
- 参考: WAI-ARIA Authoring Practices のランドマーク設計（`main` は 1 ページ 1 つ、`banner`/`contentinfo` はトップレベル）。

## 現状の問題
- `src/app/layout.tsx:145` — 全ページを `<main id="main-content">` で包む（これ自体は適切。トップレベル main の唯一の出所であるべき）。
- `src/views/LandingPage.tsx:44` — 自前の `<main>` を描画し、レイアウトの `<main>` と二重になる。`/lp` の実配信 HTML で `<main>` が 2 回出現することを確認済み。
- `src/views/LandingPage.tsx:213`（`<header>`）/ `src/views/LandingPage.tsx:54`（`<footer>`）— レイアウトの `<main>` 内部にあるため `banner` / `contentinfo` ロールが付与されない（NFR-176-07 未達）。
- `src/views/admin/AdminLayout.tsx:212` — 自前の `<main>` を描画し、レイアウトの `<main>` と二重になる。`/admin` 配下で `main` が 2 回出現する。

## 目的
1 ページにつき `main` ランドマークが 1 つだけ存在する状態にし（HTML 仕様・ARIA 準拠）、axe のランドマーク違反を 0 にする。あわせて LP の `<header>` / `<footer>` が `banner` / `contentinfo` ロールを正しく取得できるようにし、REQ-176 NFR-176-07 を満たす。

## 要件
### 機能要件
- [ ] FR-187-01: `src/views/LandingPage.tsx:44` の `<main>` を `<div>` に変更する（本文ランドマークはレイアウト側の `<main id="main-content">` に委ねる）。
- [ ] FR-187-02: `src/views/admin/AdminLayout.tsx:212` の `<main>` を `<div>` に変更する（同上）。クラス名・レイアウト（`flex-1 p-4 md:p-6 pb-20 md:pb-6`）は維持する。
- [ ] FR-187-03: LP の `<header>`（213行）と `<footer>`（54行）が、レイアウトの `<main>` の**外側**に位置するように構造を見直し、`banner` / `contentinfo` ロールが暗黙に付与される状態にする。
  - 第一案（推奨・最小変更）: FR-187-01 でページ側 `<main>` を `<div>` 化すれば、ページ内に同時可視の `main` は無くなる。ただし `<header>`/`<footer>` がレイアウトの `<main>` の内側にある限り `banner`/`contentinfo` は付かない。確実にロールを露出させるには、LP の `<header>`/`<footer>` に明示的に `role` を持たせる（後述の代替案）か、レイアウト構成（`<main>` の包む範囲）の見直しを行う。
  - 代替案（ロール露出を確実にする）: LP の `<header>` に明示的な意味づけは不要だが、レイアウトの `<main>` 内に置かれる制約上ロールが付かないため、LP の最上位ヘッダー/フッターについては `role="banner"` / `role="contentinfo"` を明示付与する、もしくはレイアウト側で LP のような「フルページ・ヘッダー/フッターを持つビュー」を `<main>` で包まない分岐を設ける。採用する手段を実装時に確定し、本書のチェックを満たすこと。
- [ ] FR-187-04: 変更後、`/`（ホーム）・`/lp`・`/admin`・`/about` 等、レイアウト配下の代表ページで `main` ランドマークがちょうど 1 つになることを確認する。

### 非機能要件（該当する場合のみ）
- [ ] NFR-187-01: 視覚的なレイアウト・余白・スタイルは変更前後で変化しないこと（`<main>` → `<div>` 化に伴う見た目の差異を出さない）。

## 受入条件
- [ ] AC-01: `/lp` の配信 HTML（または描画後 DOM）に `<main>`（ロール `main` 要素）がちょうど 1 つだけ存在する。
- [ ] AC-02: `/admin` 配下の配信 HTML（または描画後 DOM）に `main` ランドマークがちょうど 1 つだけ存在する。
- [ ] AC-03: axe（vitest-axe または Playwright axe）で、対象ページに `landmark-no-duplicate-main` / `landmark-main-is-top-level` 等のランドマーク違反が 0 件。
- [ ] AC-04: `/lp` で LP の最上位 `<header>` が `banner` ロール、`<footer>` が `contentinfo` ロールとして公開される（REQ-176 NFR-176-07 充足）。
- [ ] AC-05: 既存の LP / Admin 関連テストが全て成功する。

## 影響範囲
- `src/views/LandingPage.tsx`（44行: `<main>`、213行: `<header>`、54行: `<footer>`）
- `src/views/admin/AdminLayout.tsx`（212行: `<main>`）
- `src/app/layout.tsx`（145行: 唯一のトップレベル `<main>` 維持の確認のみ。変更は最小限）
- 関連: REQ-176（LP）NFR-176-07
- 関連テスト: LP / Admin の a11y・スナップショット系（あれば）

## 優先度
- **緊急度**: 高 / **重要度**: 高 / **理由**: `main` の入れ子・重複は HTML 仕様違反かつ `/lp` 実配信で確認済み。LP は主要導線であり、`banner`/`contentinfo` 未付与は REQ-176 の受入要件 NFR-176-07 未達に直結する。レイアウト最上位の構造問題で他 a11y 改修の前提にもなるため早期是正が必要。
