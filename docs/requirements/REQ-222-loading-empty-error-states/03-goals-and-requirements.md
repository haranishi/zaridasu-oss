## 目的

- ザリダスの全データ取得面で、**Loading(スケルトン) / Empty / Error の 3 状態を統一コンポーネント／パターンとして体系化**する。各画面が独自マークアップを増やさず、共通部品（`Skeleton*` / 新規 `EmptyState` / 既存 `ErrorAlert`）の組み合わせで 3 状態を表現できるようにする。
- **Loading は実コンテンツと同じ骨格のスケルトン**へ寄せ、体感待ち時間短縮と CLS 防止を両立する（スピナー一辺倒をやめる）。
- **Empty state を「肯定形コピー＋単一の投稿 CTA」のオンボーディング**に作り替える。新規ユーザーが最初に出会う空状態（みんなの記録・写真ギャラリー等）から、初回投稿（市民科学への初回貢献）へ自然に誘導する。
- 3 状態の全コピーを **ja/en/ko/zh の 4 ロケール**で提供し、ハードコード日本語を解消する。Loading/Empty/Error の a11y（`role="status"`/`aria-busy`/`role="alert"`）を統一する。

## 要件

### 機能要件

- [ ] FR-222-01: **3 状態の共通方針（パターン）を定義する。** 「データ取得画面は Loading(スケルトン)/Empty/Error の 3 状態を持つ」を本 REQ で明文化し、各状態の表現手段を統一する：Loading＝コンテンツ骨格に対応した**スケルトン**（`Skeleton.tsx` の部品 or 画面固有の薄いスケルトン）、Empty＝**`EmptyState` 共通コンポーネント**、Error＝既存 `ErrorAlert`＋再試行（REQ-192 の `error`/`refetch` を利用）。レンダリング分岐は `loading → error → empty → 正常` の順で評価し、Error と Empty を混同しない（REQ-192 と一致）。

- [ ] FR-222-02: **`EmptyState` 共通コンポーネントを新設する。** `src/components/ui/EmptyState.tsx`（仮）を作り、props として `icon`（絵文字 or lucide）、`title`（肯定形の見出し）、`description?`（補足・任意）、`action?`（**単一**の CTA：ラベル＋onClick or href）を受け取る。デザインノートの「説明 2 : 楽しさ 1」「肯定形＋単一 CTA」に沿い、ダーク/ライト両対応（既存 `cardCls`/`faint`/`muted` 等 `src/lib/themeClasses.ts` を流用）。**CTA は 1 つに限定**（複数アクションで意思決定を割らない）。フィルタ由来の 0 件など「リセット」が主アクションになる場合はその 1 つを CTA にできる。

- [ ] FR-222-03: **新規ユーザー導線の空状態をオンボーディング化する（肯定形＋投稿 CTA）。** 少なくとも以下を `EmptyState` 経由に置換し、否定形を肯定形へ、CTA を「投稿/貢献」に寄せる：
  - みんなの記録（多様性）`RankingPage.tsx:141-146`：例「最初の発見を記録しよう」＋補足「あなたの報告が秋田の外来生物マップを育てます」＋CTA「観察を投稿する」（未ログインなら投稿フローが AuthModal を開く既存挙動に接続）。
  - みんなの記録（ランキング）`RankingPage.tsx:218-222`：肯定形＋同様の投稿 CTA（現状 CTA 皆無を解消）。
  - 写真ギャラリー `PhotoGallery.tsx:40-47`：肯定形＋「写真付きで投稿する」CTA。
  - コメント `CommentSection.tsx:126-127`：肯定形「最初のコメントを書こう」（投稿フォームへフォーカス等、過度な CTA は付けず軽い肯定形に）。
  - 調査依頼詳細の協力者/コメント `SurveyRequestPage.tsx:290,331`：肯定形（例「協力者を募集中です」「最初のコメントで応援しよう」）。
  既に CTA を持つ `MyPostsSection.tsx:106-110` / `AreaPageClient.tsx:170-176` / `SurveyRequestsListPage.tsx:146-162` も**同じ `EmptyState` に統一**し、文言を肯定形に揃える（実装の重複解消）。

- [ ] FR-222-04: **Loading をスケルトンへ寄せる。** 中央スピナーで済ませている主要画面を、コンテンツ骨格に対応したスケルトンへ置換する：
  - みんなの記録 `RankingPage.tsx:137-140,214-217` → 行リスト用スケルトン（`SkeletonCard` か簡易行スケルトンの反復）。
  - トレンド `TrendsPage.tsx:44-47` → KPI(`SkeletonStats`)＋チャート枠＋ランキング行の骨格。
  - マイページ `DashboardPage.tsx:234-240`／マイ投稿 `MyPostsSection.tsx:101-104` → 既存 `Skeleton*` 部品で骨格化。
  - ルート `loading.tsx`（`src/app/dashboard/loading.tsx`・`src/app/post/[id]/loading.tsx` ほか）→ 各ページの骨格に寄せたスケルトン（最低限ヘッダー＋本文ブロックの形）。
  既存スケルトンで不足する形（チャート枠・プロフィールヘッダ等）は `Skeleton` を組み合わせた**画面固有スケルトン**を作る。スピナーを残すのは「ボタン内・小領域の即時操作（`LoadingButton` 等）」に限定する方針を明記。

- [ ] FR-222-05: **CLS を防ぐ。** スケルトンは**実コンテンツとほぼ同じ寸法・グリッド**（高さ/カラム数/カードの並び）にし、Loading → 正常 でレイアウトが飛ばないこと。地図・写真など固定アスペクト領域は既存の `aspect-square`/枠寸法を踏襲（`PhotoGallery.tsx:31-37` の既存スケルトンを基準化）。

- [ ] FR-222-06: **3 状態の a11y を統一する。** Loading のスケルトン/スピナーを包む領域に `role="status"` と `aria-busy="true"`（読み上げは `aria-label`/`sr-only` で `common.loading`）を付け、`Skeleton.tsx` 利用箇所でも読み上げ可能にする（既存の地図スケルトン `MapViewWrapper.tsx:7` の `role="status"` 方式に統一）。Error 表示は `ErrorAlert` を使い、`role="alert"` の付与は REQ-195 と整合（重複実装しない）。Empty は装飾アイコンを `aria-hidden`、見出しを通常テキストとして読ませる。

- [ ] FR-222-07: **3 状態のコピーを 4 ロケール i18n 化する。** 共通文言は `common`（`src/locales/*/translation.json` の `common.loading`/`error`/`retry` を活用）＋新規キー（例 `common.empty.*` や各画面 namespace の `empty`/`emptyAction`/`emptyCta`）として ja/en/ko/zh の 4 ファイルすべてに定義し、`npm run i18n:check`（`package.json:23`）のパリティを満たす。FR-222-03 で置換する直書き日本語（`RankingPage`/`PhotoGallery`/`SurveyRequestPage`/`AreaPageClient`/`SurveyRequestsListPage`/`ProfilePage` 等）をキー化する。新規にハードコード日本語を追加しない。

- [ ] FR-222-08: **DRY 化。** 同一 spinner マークアップ（`animate-spin rounded-full ...` / `Loader2 className="animate-spin"`）の重複を、スケルトン or 小さな共通ローディング表現へ寄せる。`EmptyState` 導入後は画面ごとの独自空状態マークアップを残さない（FR-222-03 の対象画面）。

### 非機能要件（該当する場合のみ）

- [ ] NFR-222-01: **REQ-192 との非競合。** 本 REQ は state 分離（Error/Empty）の配線を新設せず、REQ-192 が用意する `error`/再フェッチを**表示側で利用するだけ**にする。REQ-192 未マージのフックでも、`EmptyState`/スケルトン部分は先行導入でき、Error 表示は段階的に差し込める後方互換な作りにする。
- [ ] NFR-222-02: **既存挙動を壊さない。** 置換対象画面の正常時表示・既存テスト（`src/views/admin/__tests__/AdminPostsPage*.test.tsx` は `Skeleton` を mock 済み＝`AdminPostsPage.test.tsx:86` 等）を壊さない。`tsc --noEmit` / lint / `next build` が成功すること。
- [ ] NFR-222-03: **パフォーマンス。** スケルトンは軽量（追加の重い依存を入れない）。`animate-pulse` の多用でメインスレッドを圧迫しないよう、骨格要素数は実コンテンツ相当の少数に抑える。
- [ ] NFR-222-04: **ダーク/ライト両対応。** すべての新規 3 状態 UI が `dark:` 対応で、既存 `themeClasses`（`src/lib/themeClasses.ts`）の `cardCls`/`muted`/`faint` を流用し独自色を増やさない。
