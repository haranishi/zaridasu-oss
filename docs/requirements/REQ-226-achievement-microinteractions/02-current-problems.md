## 現状の問題

（ファイルパス:行番号つき。実コードで確認済み。推測には(推測)を付す）

### 1. いいねが「楽観的」ではなく、ネットワーク応答を待ってから state を更新している

- `src/hooks/useLike.ts:80-91` — `toggleLike` は `await supabase.from('likes').insert(...)`（または `delete`）が**解決してから** `setLiked` / `setLikeCount` を呼ぶ。つまり押下からハートが変わるまで 1 往復のレイテンシがある。`togglingRef`（37行）+ `likeLoading`（35行）でボタンは押下中ロックされるため、低速回線では「押したのに無反応」に見える。
- 失敗時（`catch`、92-98行）は `likes` を再 `count`／再 `select` してサーバ実値へ巻き戻すが、これは「ロールバック」ではなく「再取得」であり、楽観的更新を前提とした設計ではない。
- 描画する `src/components/features/posts/LikeShareSection.tsx:77-91` のいいねボタンは `transition-all`（81行）と `<Heart fill={liked ? 'currentColor' : 'none'} />`（89行）のみで、いいね成立時の**強調アニメ（pop / scale）が無い**。`liked` 切替の `fill` 変化だけでは達成感が弱い。

### 2. コメント送信も応答待ちで、成功時のフィードバックが地味

- `src/components/features/posts/CommentSection.tsx:76-105` — `handleSubmit` は `await supabase.from('comments').insert(...)`（83-92行）→ `await fetchComments()`（97行）の順で、**送信完了まで自分のコメントは一覧に現れない**。送信中はボタンが `t('comment.submitting')`（220行）に変わるのみ。
- 一方、同ファイルの `handleDelete`（107-112行）は**先に `setComments` で楽観的に消し → 失敗時に `setComments(prev)` で巻き戻す**という、本 REQ が目指す楽観的 UI＋ロールバックの良い手本が既に存在する。送信（insert）側だけがこの恩恵を受けていない。
- 成功時に**達成感のフィードバック（トースト or 軽い入場アニメ）が無い**。トースト基盤（`ToastContext` / `Toast.tsx`）は存在するのに、コメント／いいね成功では使われていない。

### 3. リポジトリに `useOptimistic` の利用が無く、楽観的 UI の共通作法が未確立

- `grep -rn "useOptimistic\|optimistic\|rollback" src` の実ヒットは `src/hooks/usePostForm.ts:150`（画像アップロード失敗時のストレージ rollback）のみで、UI 状態の楽観的更新には使われていない。React 19 で `useOptimistic` が使えるのに作法が無いため、いいね・コメント・（将来の）他アクションで実装がバラつくリスクがある。

### 4. バッジ解放（アンロック）の演出が無い

- バッジ付与はサーバ側トリガー `check_and_grant_badges()`（`supabase/schema.sql:716-744`）が投稿承認時に行い、`first_post` / `posts_10` / `multi_species`（種同定）/ `multi_municipality` / `first_comment`（`schema.sql:346`）/ `absence_reporter` / `ai_perfect` 等を `user_badges` に INSERT する。種同定・初投稿・観察数の節目は**サーバ側で既に判定済み**。
- しかし表示側は静的：
  - `src/views/ProfilePage.tsx:258-283` — 獲得済みは通常表示、未獲得は `opacity-40`（269行）。`transition-colors`（266行）のみで、新規獲得の**解放アニメは無い**。
  - `src/components/features/dashboard/BadgeSection.tsx:47-68` — 同様に earned / not-earned を `opacity-40`（56行）で出し分けるだけ。進捗バー（37-42行）はあるがバッジ自体の**解放演出は無い**。
- そのため「種同定して新しいバッジが付いた」「初投稿バッジを獲得した」という達成の瞬間が、次にプロフィールを開いたとき静かに earned 表示へ変わっているだけで、**達成のフィードバックが体験されない**。

### 5. 観察数の進捗カウンタ（積み上げの可視化）が無い

- 地域ページ（`/area/[slug]`、`src/views/DetailPage.tsx:541-544` からリンク）やプロフィールに、「この地域で N 種を観察」「観察 M 件」のような**進捗カウンタ＋カウントアップ演出が無い**。プロフィールの統計（`ProfilePage.tsx:241-254`）は数値の静的表示のみ。
- スクロール連動の数値演出に CSS `animation-timeline: scroll()` を使う案があるが、リポジトリに使用箇所は**無い**（`grep -rn "animation-timeline\|scroll()" src` ヒットなし）。Safari は `animation-timeline` を未サポート(推測: 2026年時点の主要 Safari でも未対応)のため、採用するなら静的フォールバック必須。

### 6. アニメ資産は最小限で、達成感向けの軽量キーフレームが未整備

- `src/app/globals.css` の汎用キーフレームは `fadeSlideIn`（303行、トースト用）と `skeleton-progress`（309行）程度。いいね pop・バッジ解放・カウントアップに使える `transform`/`opacity` ベースのキーフレームは**未定義**。
- 既存アニメの大半は `Loader2 ... animate-spin`（多数）や LP 専用 `lp-*`（`globals.css:346-407`）で、達成感マイクロインタラクションには流用しにくい。
- ただし `prefers-reduced-motion` のグローバル抑制（`globals.css:63-70`）は整備済みで、`AudioRecorder.tsx:108` のように `window.matchMedia('(prefers-reduced-motion: reduce)')` を JS で見る前例もある。新規アニメはこの土台に載せれば reduced-motion を自動で尊重できる。
