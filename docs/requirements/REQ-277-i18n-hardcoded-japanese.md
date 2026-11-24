# REQ-277: i18n半翻訳の解消（ハードコード日本語・ロケール固定日付）

優先度: **P1（Phase 1）/ P2（Phase 2）** ／ 深刻度: **Medium** ／ 種別: i18n・UX一貫性

## 背景

本アプリは ja/en/zh/ko の4言語をドロワーで即時切替できるが、`t()` を通らない日本語リテラルが多数残っており、言語切替後も日本語が混在する。CI の `i18n:check` は **JSONキーの4言語パリティのみ**を検証するため、この層（JSX直書き・定数 `.label` 直参照・date-fns ロケール固定・hooks内エラー文言）は検出できない。

### Phase 1（グローバル・高頻度导線 — 今回実装）

| 場所 | 内容 |
|---|---|
| `src/hooks/posts/usePostList.ts:110,137` | フェッチ失敗トーストが日本語直書き（REQ-273 FR-273-02 と同時に対応） |
| `src/components/layout/Footer.tsx:17-18` | 「ランキング」「地域別情報」だけ直書き（兄弟リンクは t() 済み） |
| `src/views/NotFoundPage.tsx:14,16,23` | 404ページ全文直書き |
| date-fnsロケール `ja` 固定4ファイル: `src/views/AreaPage.tsx:244` / `src/views/SurveyRequestPage.tsx:223,266,374` / `src/views/SurveyRequestsListPage.tsx:204` / `src/components/features/dashboard/MyPostsSection.tsx:296` | 既存ヘルパー `getDateLocale(i18n.language)`（`src/lib/dateLocales.ts`）へ統一（DetailPage 等は使用済み） |

### Phase 2（画面ローカル — 別途実施）

- 調査依頼一覧/詳細のフィルタ・チップ・コメント欄（`SurveyRequestsListPage.tsx:91-226`、`SurveyRequestPage.tsx:286-471`）
- 地域ページ群（`AreaPage.tsx`・`AreaListPage.tsx`。SEO目的でJP固定の可能性を先に判断すること）
- DashboardPage 統計ラベル（`:223-332`）、TrendsPage の定数 `.label` 直参照（`:83,113`）、MyPostsSection のAI判定ラベルMap（`:61-77`）、AudioRecorder 見出し（`:352-368`）
- offlineStore / useEditPost / useSurveyRequestComments の throw/エラー文言の安定キー化
- 管理画面系（内部向けのため最低優先）

## 機能要件

- **FR-277-01（P1）**: Phase 1 の4項目を i18n 化・ロケール連動化する。追加キーは ja/en/zh/ko 4言語すべてに追加し `i18n:check` を維持する。
- **FR-277-02（P2）**: Phase 2 を画面単位で順次 t() 化する。
- **FR-277-03（再発防止・P2）**: ハードコード日本語（ひらがな・カタカナ・漢字リテラル）を `src/views`・`src/components` で検出する lint ルールまたはスクリプトを検討し、意図的なJP固定（SEOページ等）は明示アノテーションで除外する方式を設計する。

## 受入基準

- **AC-01（P1）**: 言語を en に切り替えた状態で、Footer・404・ホームのエラートースト・対象4ファイルの相対時刻/日付が英語表示になる。
- **AC-02**: `npm run i18n:check` パス（4言語パリティ維持）。
- **AC-03**: `lint` / `type-check` / 既存テストパス。
