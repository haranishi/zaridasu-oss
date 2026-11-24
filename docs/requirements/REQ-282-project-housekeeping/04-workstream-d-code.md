## ワークストリームD: コード精度（監査残のLow項目一括）

2026-07-17監査で確認済み・未対応のLow項目。**挙動変更なしのメンテナンスのみ**を対象とする。

| # | 内容 | 場所 |
|---|---|---|
| D-1 | デッドコード `MiniProfile.tsx`（どこからもimportされない48行）を削除 | `src/components/features/home/MiniProfile.tsx` |
| D-2 | フィードバックフォームURL（forms.gle）3箇所直書き → `constants.ts` に `FEEDBACK_FORM_URL` を定義して参照 | `Footer.tsx:26` / `DrawerMenu.tsx:297` / `AboutPage.tsx:245` |
| D-3 | dataset の引用URLを `BASE_URL` 定数へ統一（現在リテラル/env再実装。別ドメイン配信時に学術引用URLが誤る） | `dataset/page.tsx:113,267` / `zaridasu.csv/route.ts` / `zaridasu.geojson/route.ts` |
| D-4 | PostgRESTエイリアスselectの `as unknown as` 二段キャスト（7箇所）に中間Row型を定義し、selectドリフトを型で検出可能にする | `usePostList.ts` / `DetailPage.tsx` / `useAdminPosts.ts` / `useSurveyRequests.ts` / `AdminExperimentsPage.tsx` / `AdminAiCostPage.tsx` |
| D-5 | `useStats.ts:172` 月ラベルの `new Date(m.month)` UTCパースを検証（RPC返却書式を確認し、必要なら `toLocalISODate` 系へ） | `src/hooks/useStats.ts` |
| D-6 | `calc-ai-cost.ts` の単価表に更新日・出典コメント、未知モデル時の警告出力 | `scripts/calc-ai-cost.ts:23-38` |
| D-7 | `.size-limit.json` に `/post/[id]` チャンクの予算を追加（REQ-278でAuthModal遅延化済み。再肥大の検知線を張る） | `.size-limit.json` |
| D-8 | 500行超コンポーネント8本（LandingPage 760 / DetailPage 722 / MapView 678 / AuthModal 648 / AdminPostsPage 627 / AdminKpiPage 627 / AudioRecorder 561 / PostForm 527）の**分割候補リスト化のみ**（分割実施は個別REQで） | `src/views/` `src/components/` |

### 機能要件

- **FR-282-D1**: D-1〜D-7 を実施する（各項目とも機能・表示の変更なし）。
- **FR-282-D2**: D-8 は分割方針メモ（どの単位でサブコンポーネント/フック化するか）を各ファイル1〜3行で残すに留める。

---
