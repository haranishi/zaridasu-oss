## 現状の問題

（ファイルパス:行番号つき。コードは実値で確認済み）

### A. Loading 状態が「ページ中央のスピナー」に偏り、スケルトン資産が活かされていない

- スケルトン部品 `Skeleton` / `SkeletonCard` / `SkeletonTable` / `SkeletonStats` は `src/components/ui/Skeleton.tsx:10,18,35,56` に**存在する**が、利用箇所は**管理画面のみ**：`src/views/admin/AdminPostsPage.tsx:519`（`SkeletonCard`）、`src/views/admin/AdminDashboard.tsx:36-41`（`SkeletonStats`/`SkeletonCard`）。一般ユーザー向け画面では一切使われていない。
- 一般向け画面の Loading は**コンテンツ形状と無関係な中央スピナー**：
  - みんなの記録: `src/views/RankingPage.tsx:137-140`（多様性）と `:214-217`（ランキング）が `Loader2` の中央スピナー。
  - トレンド: `src/views/TrendsPage.tsx:44-47` が `Loader2` 中央スピナー（KPI・グラフ・ランキングという複雑な構造を予告しない）。
  - プロフィール: `src/views/ProfilePage.tsx:184-189` が全画面スピナー。
  - マイページ: `src/views/DashboardPage.tsx:234-240` が全画面スピナー、`src/components/features/dashboard/MyPostsSection.tsx:101-104` も小スピナー。
- ルートレベルの `loading.tsx` も**すべて同一の中央スピナー**で、遷移先の骨格を予告しない：`src/app/loading.tsx`、`src/app/post/[id]/loading.tsx`、`src/app/dashboard/loading.tsx`（`src/app/admin/loading.tsx` のみ管理色）。中身はいずれも `animate-spin rounded-full ...` の単一スピナー。
- 結果として (a) スケルトンの「何が出るか予告する」効果が一般ユーザーに届かず、(b) スピナー → 実コンテンツの差し替えで**レイアウトが飛ぶ（CLS）**。スケルトン部品があるのに重複した一回限りの spinner マークアップが各所に散在している（DRY 違反）。

### B. Empty state が「否定形＋行き止まり」で、オンボーディング機会を逃している

- 否定形コピー中心・CTA 無し/弱い空状態が散在：
  - `src/views/RankingPage.tsx:144`「まだ記録がありません」（CTA 無し。補足文 `:145` のみ）、`:221`「まだランキングデータがありません」（**CTA 完全に無し**）。
  - 写真ギャラリー `src/components/features/posts/PhotoGallery.tsx:44`「まだ写真付きの投稿がありません」（絵文字はあるが**投稿 CTA 無し**）。
  - 調査依頼詳細 `src/views/SurveyRequestPage.tsx:290`「まだ協力者はいません」、`:331`「まだコメントはありません」（CTA 無し）。
  - コメント `src/components/features/posts/CommentSection.tsx:127`（`t('comment.noComments')` =「まだコメントはありません」）。
- CTA を持つ良い例も**実装がバラバラ**で、共通コンポーネントを通っていない：
  - マイ投稿 `src/components/features/dashboard/MyPostsSection.tsx:106-110`（`myPosts.empty` ＋トップへのリンク ＋ `emptyAction`）。
  - 地域 `src/app/area/[municipality]/AreaPageClient.tsx:170-176`「この地域の報告はまだありません」＋「マップから投稿する」リンク。
  - 調査依頼一覧 `src/views/SurveyRequestsListPage.tsx:146-162`（フィルタ有無で文言切替＋「依頼を立てる」/「フィルタをリセット」）。
- つまり (a) 各画面が**独自マークアップ**で空状態を組み、(b) 「肯定形コピー＋単一 CTA」という方針が**徹底されておらず**、特に新規ユーザーが最初に出会う空状態（みんなの記録・ギャラリー）が初回投稿へ導けていない。**`EmptyState` 共通コンポーネントは存在しない**（`src/components/ui/` に該当なし）。

### C. 3 状態のコピーがハードコード日本語で、i18n パリティから外れている箇所がある

- 空状態の多くが `t()` を介さない**直書き日本語**：`RankingPage.tsx:144,145,221`、`PhotoGallery.tsx:44`、`SurveyRequestPage.tsx:290,331`、`ProfilePage.tsx:205`、`AreaPageClient.tsx:172`、`SurveyRequestsListPage.tsx:150,154,159`。一方 `MyPostsSection`/`CommentSection`/admin 系は i18n 済み（`myPosts.empty` 等／`comment.noComments`／`admin.*.empty`）。混在している。
- Loading 系の `aria-label="地図を読み込み中"` も直書き（`src/components/features/map/MapViewWrapper.tsx:7` ほか）。`src/locales/ja/translation.json` には `common.loading`(`:534`) / `common.error`(`:535`) / `common.retry`(`:536`) が**既にある**ので、3 状態の共通文言の足場はあるが、各画面がそれを使えていない。

### D. Loading 状態の a11y（読み上げ）も不統一

- 地図/ミニ地図のスケルトンは `role="status"` + `aria-label`（`MapViewWrapper.tsx:7`, `MiniMap.tsx:9`, `SurveyRequestForm.tsx:12`, `LocationSection.tsx:14`）を持つが、一般ページのスピナー（`RankingPage`/`TrendsPage`/`ProfilePage`/`DashboardPage` の `Loader2`）と `Skeleton.tsx` の各部品は **`role="status"`/`aria-busy` を持たない**ため、スクリーンリーダーに「読み込み中」が伝わらない。Error は `ErrorAlert`（`src/components/ui/ErrorAlert.tsx`）に `role` が無い（REQ-195 で別途対応中だが、本 REQ の Error 表示でも `ErrorAlert` を使うため整合が要る）。
