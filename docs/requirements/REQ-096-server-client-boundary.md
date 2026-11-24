# REQ-096: Server / Client コンポーネント境界の見直し

> 親 REQ: REQ-092（Web アプリ軽量化包括要件）

## 背景
`grep -rn "'use client'" src/` の結果、ザリダスには **94 個** の Client Component が存在する。Next.js 15 App Router では Client Component は JS bundle に乗るため、本当に Client が必要なものだけに絞ると初期 bundle が縮む。

**最大の問題**：
- `src/app/(home)/HomePageClient.tsx` が `'use client'` の re-export ファイルになっている
  ```ts
  'use client'
  export { default } from '@/views/HomePage'
  ```
- `src/views/HomePage.tsx` も `'use client'` で始まる
- 結果、ホーム（`/`）は Server Rendering してもページ全体が Client Component として bundle に乗る
- HomePage 内の `Header` / `BottomNav` / `FilterBar` / `SignupBanner` / `PhotoGallery` も全て Client

## 現状の Client Component 一覧（94 件）
代表例（State / Effect を本当に必要としないものを含む）：
- `Footer.tsx` ← 純粋表示
- `HowToSection.tsx` ← 純粋表示
- `SignupBanner.tsx` ← 静的 CTA（クリックで遷移するだけ）
- `seo.ts` ← ライブラリだが `'use client'` がついているか要確認
- `dateLocales.ts` ← 同上

`Header.tsx` / `BottomNav.tsx` / `DrawerMenu.tsx` は Drawer 開閉や認証 state を持つので Client が必要だが、内部のロゴ / ナビ静的部分は子 RSC として剥がせる。

## 目的
Client Component の数を「本当に必要な物だけ」に絞り、初期 JS bundle から表示専用部品を取り除く。HomePage（`/`）の First Load JS を 20〜40KB 削減する。

## 要件

### 機能要件
- [ ] FR-096-01: `src/app/(home)/HomePageClient.tsx` の re-export 構造を解体する。
  - 新構造：`src/app/(home)/page.tsx`（RSC）→ `<HomeShell>`（RSC、ヘッダー / フッター / SEO）→ `<HomeInteractive>`（Client、地図 / フィルタ / モーダル）。
  - `HomeInteractive` は HomePage.tsx から hooks / 地図関連だけを抽出した最小 Client コンポーネント。
- [ ] FR-096-02: 純粋表示の Client Component を RSC に変更する：
  - `Footer.tsx`
  - `HowToSection.tsx`
  - `SignupBanner.tsx`（クリックハンドラがあるなら `<a>` リンクに置換、または小さな Client wrapper のみ Client）
- [ ] FR-096-03: `Header.tsx` の中で「ロゴ + ナビリンク（静的）」を子 RSC に切り出し、開閉トリガーボタンだけを Client にする。
- [ ] FR-096-04: `BottomNav.tsx` / `DrawerMenu.tsx` も同様に内部分割を行う（過度な分割は避け、State 境界で 1 段だけ）。
- [ ] FR-096-05: 全 `'use client'` 宣言を棚卸しし、Client が不要な物のリストを「現状分析チェックリスト」として `docs/requirements/REQ-096-client-component-audit.md`（別途）に保存する。
  - 棚卸し基準: `useState` / `useEffect` / event handler / browser API / Context Hook を使っているか？

### 非機能要件
- [ ] NFR-096-01: 既存テスト（vitest / Playwright / vitest-axe）が全て pass すること。
- [ ] NFR-096-02: ホームの First Load JS が **20KB 以上** 削減されること（gzip）。
- [ ] NFR-096-03: hydration エラーが 0 件であること（コンソール / Sentry）。
- [ ] NFR-096-04: Authentication state や Theme などの Context が hydrate 後も同期されていること。

## 受入条件
- [ ] AC-01: `src/views/HomePage.tsx` が `'use client'` を持たない、または持つ場合は最小限の Client コンポーネントに分割されている。
- [ ] AC-02: `src/app/(home)/HomePageClient.tsx` のような単純 re-export ファイルが消えている。
- [ ] AC-03: `Footer` / `HowToSection` / `SignupBanner` の `'use client'` 宣言が除去されている。
- [ ] AC-04: `npm run build` が成功し、size-limit の値が現状以下になっている。
- [ ] AC-05: `grep -c "'use client'" src/` の件数が現状（94）から **少なくとも 5 件減少** している。
- [ ] AC-06: 既存の Playwright E2E（ホーム / 認証 / 投稿）が全て pass する。

## 影響範囲
- `src/app/(home)/page.tsx`
- `src/app/(home)/HomePageClient.tsx`（削除候補）
- `src/views/HomePage.tsx`（分割）
- `src/components/layout/Footer.tsx`
- `src/components/ui/HowToSection.tsx`
- `src/components/features/auth/SignupBanner.tsx`
- `src/components/layout/Header.tsx`（内部分割）
- `src/components/layout/BottomNav.tsx`（内部分割）
- `src/components/layout/DrawerMenu.tsx`（内部分割）

## 優先度
- **緊急度**: Medium
- **重要度**: High
- **理由**: HomePage 全体 Client 化が最大級のボトルネック。1 PR で 20KB 級の削減 + RSC 化のインフラ整備につながる。

## 実装メモ
- 「`'use client'` を消すか迷う」基準：
  - **消せる** = JSX 出力 + 静的 props だけ。State / Effect / Context Hook なし。
  - **消せない** = `useState`, `useEffect`, `onClick`, `useRouter` (next/navigation の Client 版), Context Hook 等を使う。
- Context（`AuthContext`, `ThemeContext`）は Client Provider でラップしているので、Provider の **配下** の Client コンポーネントは引き続き Client。Provider 自体を `'use client'` にした上で、子に純粋 RSC を混在させること自体は OK。
- HomePage の分割は大きな変更なので、**段階的 PR** にする：
  1. PR-1: 純粋表示 Client → RSC 化（Footer, HowToSection, SignupBanner）
  2. PR-2: HomePage の Shell + Interactive 分割
  3. PR-3: Header / BottomNav の内部分割

## リスク
- **hydration mismatch**：Server と Client で異なる JSX を返すと Next.js 15 は warn → error になる。`suppressHydrationWarning` を安易に付けないこと。
- **Context 依存**：`useAuth` / `useTheme` を使うコンポーネントを RSC 化しようとすると build エラー → 子 Client コンポーネントに State 境界を残す。
