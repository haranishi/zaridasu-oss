# REQ-101: HomePage の RSC + Client 2 段分割

> 親 REQ: REQ-092 / REQ-096（Server/Client 境界の見直し — 包括）

## 背景
ザリダスのホーム（`/`）は **全描画ロジックが Client Component** になっており、Next.js 15 App Router の RSC を活用できていない。

- `src/app/(home)/HomePageClient.tsx`：`'use client'` の re-export ファイル
- `src/views/HomePage.tsx`：`'use client'` で始まり、ヘッダー / フッター / SEO / 静的セクションも全部 Client 化
- 結果として First Load JS 217KB の頭打ち。RSC 化しないと改善余地が頭打ち。

## 現状の問題
- `src/app/(home)/HomePageClient.tsx` の re-export 構造が「ページが Client」であることを強制
- `src/views/HomePage.tsx` 内で hooks（`useReducer`, `useTranslation`, `useTheme`, `useAuth`, `usePostList`, `useSurveyRequests`）が呼ばれるため一括での RSC 化は不可能
- 静的部分（Header / Footer / SEO 補強）と動的部分（地図 / フィルタ / モーダル）が同一コンポーネントに混在

## 目的
HomePage を Server Component の Shell + 必要最小限の Client Interactive に分割し、初回 First Load JS を 20〜40KB 削減する。

## 要件

### 機能要件
- [ ] FR-101-01: `src/app/(home)/HomePageClient.tsx` を削除する
- [ ] FR-101-02: `src/app/(home)/page.tsx` を Server Component（既存）として維持し、子に `<HomeShell>`（RSC）を返すように改修
- [ ] FR-101-03: `src/app/(home)/HomeShell.tsx`（新規 RSC）を作成し、ヘッダー / フッター / SEO 補強 / 静的 hero などの非インタラクティブ部分を含める
- [ ] FR-101-04: `src/app/(home)/HomeInteractive.tsx`（Client）を作成し、地図 / フィルタ / 投稿モーダル / 認証モーダル / 調査依頼モーダル等の動的部分を集約
- [ ] FR-101-05: `<HomeShell>` 内に `<HomeInteractive>` を配置し、props でユーザー判定や初期データを渡す
- [ ] FR-101-06: 初期データ（投稿一覧 / 調査依頼一覧）を可能な範囲で Server 側 `createServerClient` で fetch し、`<HomeInteractive>` に渡す（Phase 2 候補）
- [ ] FR-101-07: 既存の `src/views/HomePage.tsx` は段階的に廃止 → `HomeInteractive` に責務移動

### 非機能要件
- [ ] NFR-101-01: First Load JS（`/`）が **−20KB 以上** 縮むこと（gzip）
- [ ] NFR-101-02: 既存 Playwright E2E（home.spec.ts）が無修正で pass すること
- [ ] NFR-101-03: hydration mismatch warning が 0 件であること
- [ ] NFR-101-04: LCP / CLS が悪化しないこと（web-vitals 計測 / REQ-097）

## 受入条件
- [ ] AC-01: `src/app/(home)/HomePageClient.tsx` が存在しない
- [ ] AC-02: `src/app/(home)/page.tsx` の return が `<HomeShell>` を返す（または同等の RSC 構造）
- [ ] AC-03: `npm run build` 後の `/` の First Load JS が 195KB 以下
- [ ] AC-04: `'use client'` ディレクティブが `HomeInteractive.tsx` のみで、`HomeShell.tsx` には無い
- [ ] AC-05: 既存ホームの全機能（投稿モーダル / 認証 / 地図 / 調査依頼 / フィルタ / バウンズ）が回帰しない（Playwright pass）
- [ ] AC-06: bundle-analyzer の treemap で `chunks/app/(home)/page-*.js` のサイズが現状から減っている

## 影響範囲
- `src/app/(home)/page.tsx`
- `src/app/(home)/HomePageClient.tsx`（削除）
- `src/app/(home)/HomeShell.tsx`（新規）
- `src/app/(home)/HomeInteractive.tsx`（新規）
- `src/views/HomePage.tsx`（段階的廃止）
- `tests/e2e/home.spec.ts`（変更不要を確認）

## 優先度
- **緊急度**: High
- **重要度**: High
- **理由**: 軽量化バッチ（REQ-092）の積み残し最大の山。これを倒さないと First Load JS 200KB 切りが達成できない。Large 規模だが効果も大きい。

## 実装メモ
- 段階的 PR を推奨：
  - PR-1: HomeShell / HomeInteractive の骨格作成（描画は HomeInteractive に丸投げ）
  - PR-2: 静的セクションを HomeShell へ移動
  - PR-3: 初期データ Server fetch（Phase 2）
- Context（`AuthContext` / `ThemeContext` / `MapSettingsContext`）の Provider は `src/app/providers.tsx` で既にラップされているため、`HomeInteractive` から問題なく利用可能
- `useTranslation` は Client Hook なので `HomeInteractive` 内のみ使う。`HomeShell` での翻訳は Server Component 用の i18n 戦略（next-intl 等）が要件外なら静的文字列でも OK
