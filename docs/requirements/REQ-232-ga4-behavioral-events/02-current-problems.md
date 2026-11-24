## 現状の問題

（ファイルパス:行番号つき。「未計測」は当該ファイルに `dataLayer`/`gtag`/`sendGAEvent` 呼び出しが存在しないことを `grep` で確認した事実）

### 1. 計測ユーティリティが LP 専用に閉じており、全画面で使える汎用関数が無い

- `src/lib/lpAnalytics.ts:6` の `LpEventName` は LP 5 イベントにユニオン型で固定され、`pushLpEvent()`（`:8-13`）も LP 文脈に閉じている。一方 `WebVitalsReporter.tsx:12-27` と `AuthModal.tsx:130,173`・`AuthCallbackPage.tsx:53-79` は **各所で `window.dataLayer?.push({ event, ...})` を直書き**しており、production ガード（`process.env.NODE_ENV !== 'production'` の早期 return）も `lpAnalytics.ts:10` と `WebVitalsReporter.tsx:14` で**重複実装**されている。
- 結果、行動イベントを追加するたびに「production ガード + SSR ガード（`typeof window === 'undefined'`）+ `dataLayer` 初期化」を各ファイルで再実装することになり、抜け・不統一（例: `AuthModal`/`AuthCallbackPage` は production ガードを持たず dev でも送る）を生む。`window.dataLayer` 型は `src/types/gtm.d.ts:2` と `WebVitalsReporter.tsx:8` で**二重宣言**されている。

### 2. 投稿ファネル（参加の中核）が全て未計測

- **フォーム開始（post_start）**: `src/app/(home)/HomeInteractive.tsx:190-193` の `handlePostClick`（ログイン済みなら `OPEN_POST_FORM`、未ログインなら auth へ）に計測なし。`PostForm` 自体（`src/components/features/posts/PostForm.tsx`）にもマウント計測なし。
- **写真添付（media_attached）**: `src/hooks/usePostForm.ts:57-113` の `handleFileChange`（ファイル選択・EXIF 取得・画像ゲート判定）に計測なし。市民科学では「写真添付に至ったか」が投稿完遂の強い先行指標。
- **送信試行（post_submit）/ 成功（post_success）/ 失敗**: `usePostForm.ts:220-377` の `submitPost`。`posts.insert` 成功は `:351 return true`、各種バリデーション失敗は `:243/250/255/260 return false`、例外は `:352-373`。いずれにも計測なし。さらに `:380-419` の `saveOffline`（オフライン下書き保存）も未計測で、オフライン投稿の発生率が見えない。
- 補足: AI 種判定はクライアントではなく **`posts` INSERT トリガー経由の Edge Function で投稿後に非同期実行**される（`usePostForm.ts:347-349` のコメント）。したがって投稿フォーム内に「AI 判定ビュー」は存在せず、AI 結果は**投稿詳細ページで初めて描画**される（次項）。`ai_identify_view` はそこに置くのが正しい（メモの `ai_identify_view` を実コードに合わせて再配置）。

### 3. 投稿詳細でのエンゲージ（いいね/コメント/通報/AI 判定ビュー）が未計測

- **いいね（like）**: `src/hooks/useLike.ts:70-103` の `toggleLike`。`likes.insert`（`:87-90`）/ `delete`（`:82-85`）成功時に計測なし。詳細ページ側の起点は `src/views/DetailPage.tsx:140 toggleLike(() => openAuth('signup'))`。
- **コメント投稿（comment_post）**: `src/components/features/posts/CommentSection.tsx:76-105` の `handleSubmit`。`comments.insert` 成功（`:95-103`）に計測なし。
- **通報（report_submit）**: `src/components/modals/ReportModal.tsx:38-60` の `handleSubmit`。`reports.insert` 成功（`:52-53 setDone(true)`）に計測なし。通報は健全性の重要シグナルだが発生量が不可視。
- **AI 判定ビュー（ai_identify_view）**: `src/views/DetailPage.tsx:358-430` で `post.ai_result` を「AI判定カード」として描画（`:360` で `ai_result` 取得、`:379` で confidence 算出、`:385` で種ラベル）。このカードの表示・展開が未計測で、「AI 判定がユーザーにどれだけ届き、信頼度別にどう受け取られるか」が測れない（卒研の AI 支援 RQ に直結する観点）。

### 4. 地図操作・ギャラリー閲覧が未計測

- **地図操作（map_interact）**: `src/app/(home)/HomeInteractive.tsx:218 onBoundsChange`（地図移動/ズームで bounds 更新）、`:206-211 FilterBar` の `onBoundsFilterToggle`（表示範囲で絞り込み）に計測なし。地図がメイン UI であるザリダスで「地図を操作したエンゲージ」が完全に不可視。
- **ギャラリー閲覧（gallery_view）**: `HomeInteractive.tsx:273-367` の `MapGalleryPager` で `panelIndex` を 1 に切替（`:329 setPanelIndex(1)`、`:304-305` スワイプ）で写真ギャラリーへ遷移するが、`PhotoGallery`（`:356`）の表示が未計測。
- **検索（search）**: `src/components/features/dashboard/FilterBar.tsx:79-82` の検索入力（`handleChange('search', ...)` → `HomeInteractive` の `filters.search` → `usePostList` のデバウンス fetch `HomeInteractive.tsx:177-183`）に計測なし。GA4 推奨イベント `search`（拡張計測の `view_search_results` はクエリパラメータ `q` 等を URL で検知する方式だが、ザリダスの検索は URL に出ない state ベースのため、明示送出が必要。ガイド `:59`/`:208-209` 参照）。

### 5. 調査依頼の送信（リード相当の重要 CV）が未計測

- `src/components/modals/SurveyRequestForm.tsx:53-75` の `handleSubmit` が `createRequest(...)`（`src/hooks/useSurveyRequests.ts`）を呼び、成功で `onSuccess?.()`→`onClose()`（`:68-69`）。ここに計測なし。調査依頼は「行政/研究者への能動的な働きかけ」であり、GA4 推奨イベント `generate_lead`（リード獲得）に最も近い**キーイベント候補**だが、現状ゼロ。フォーム開始（`HomeInteractive.tsx:201-205 onSurveyClick`）も未計測でファネル分析ができない。

### 6. キーイベント（旧 CV）化の設計・台帳が無い

- 現状 `sign_up`/`login` は送出されているが（前述）、どのイベントを GA4 で**キーイベントとしてマーク**するかの設計・記録がリポジトリ/ドキュメントに無い（`grep -rn "キーイベント\|key event\|generate_lead" docs/` で本 REQ 以前にヒットなし）。GA4 ではキーイベント化は管理画面操作であり（ガイド `:203-205`）、**イベント名・パラメータの「計測仕様書（tracking plan）」をコード外に持たないと、名前のリネームでキーイベント指定が外れる**事故（ガイド `:201`）や、カスタムパラメータの未登録でレポートに出ない事象（ガイド `:210`）が起きる。
