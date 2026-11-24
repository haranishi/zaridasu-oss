## 目的

ユーザーの主要アクション（いいね・コメント・投稿成功）に**操作直後の即時フィードバック**を与え、節目（初投稿・種同定・観察数）で**バッジ解放アニメ**を、地域／プロフィールで**観察進捗カウンタ**を提供して、市民科学の継続動機（ゲーミフィケーションの視覚面）を高める。すべて Obsidian 2 ノートの原則に従い、`transform`/`opacity` 中心・duration 100〜300ms・入場 ease-out・`prefers-reduced-motion` 遵守の**軽量実装**とする。データ品質に連動した称号設計（品質ゲーミフィケーション）は本 REQ では扱わず REQ-235 に委ねる。

## 要件

### 機能要件

- [ ] FR-226-01: **いいねを楽観的 UI 化する。** `src/hooks/useLike.ts` の `toggleLike`（80-91行）を、押下時にまず `liked`/`likeCount` を即時更新し、その後にサーバへ反映、失敗時に元値へロールバックする方式へ改める。実装は React 19 の `useOptimistic` を用いるか、`CommentSection.handleDelete`（`CommentSection.tsx:108-111`）と同型の「prev 退避 →setState→ 失敗時 setComments(prev)」パターンを踏襲してよい。`togglingRef`（37行）の二重発火防止は維持する。失敗時はエラーをユーザに明示（FR-226-05 のトースト）し、無言で握りつぶさない。

- [ ] FR-226-02: **いいね成立時の軽量強調アニメを追加する。** `LikeShareSection.tsx:77-91` のハートに、`liked` が false→true になった瞬間だけ `transform: scale()` ベースの pop（例 1→1.2→1、duration ≤ 250ms、ease-out）を与える。`width`/`top`/`margin` は使わない（reflow 回避）。`prefers-reduced-motion: reduce` では pop を行わず `fill` の即時切替のみとする（`globals.css:63-70` のグローバル抑制で自動的に無効化される実装を優先）。連打時にアニメが破綻しない（FR-226-01 のロック内で 1 回だけ発火）こと。

- [ ] FR-226-03: **コメント送信を楽観的 UI 化する。** `CommentSection.handleSubmit`（`CommentSection.tsx:76-105`）を、送信前に楽観的コメント（一時 id・`created_at` は now・`is_admin` は現在値）を一覧へ即時 append し、`insert` 成功後に確定 id で置換、失敗時に取り除いて入力内容を復元する方式へ改める。`useOptimistic` で実装してよい。確定後の `fetchComments()`（97行）呼び出しは、楽観的 append と整合する形（重複表示しない）に調整する。`notify-comment` の invoke（99-101行）は確定 id 取得後に限り従来どおり行う。

- [ ] FR-226-04: **新規コメントの入場アニメを軽量化する。** 楽観的に追加されたコメント行に、`opacity`+小さな `translateY`（または既存 `fadeSlideIn`、`globals.css:303-307`）の ease-out 入場（duration 150〜250ms）を与える。reduced-motion では即時表示。

- [ ] FR-226-05: **アクションの成功／失敗フィードバックをトーストで統一する。** 既存 `useToastContext`（`src/context/ToastContext.tsx`）を用い、(a) いいね失敗・コメント送信失敗で `error` トースト、(b) 必要に応じてコメント送信成功で控えめな `success` トーストを出す。トーストは `aria-live="polite"`（`Toast.tsx:60`）で読み上げられる既存実装に乗せる。いいね成功は視覚 pop で足りるためトーストは出さない方針を既定とし、出す/出さないの判断根拠を実装コメントに残す。

- [ ] FR-226-06: **バッジ解放アニメを実装する。** ユーザが新たに獲得したバッジ（初投稿 `first_post`・種同定 `multi_species`・観察数の節目 `posts_10/50/100` 等。付与は `check_and_grant_badges()`／`schema.sql:716-744`）を検知し、`ProfilePage.tsx:258-283`（自分のプロフィール＝マイページ表示時）または `BadgeSection.tsx:47-68`（ダッシュボード）で**解放アニメ（locked→unlocked への `opacity` フェード＋ `transform: scale()` の pop、box-shadow/グラデーションの軽量質感）**を一度だけ再生する。「新規かどうか」の判定方法は次のいずれかとし、選定根拠を本 REQ または実装コメントに明記する：
  - (a) `user_badges.earned_at`（`schema.sql:1177`、`get_user_profile` の `badges[].earned_at`＝`schema.sql:876` で取得可）と「前回ユーザが見た時刻」をクライアント（localStorage 等）に保持して差分判定。
  - (b) 既知バッジ ID 集合を localStorage に保持し、未知 ID が増えたら新規とみなす。
  サーバスキーマやトリガーは変更しない（表示側のみ）。reduced-motion では pop/フェードを行わず通常表示。

- [ ] FR-226-07: **観察進捗カウンタを追加する。** 地域ページ（`/area/[slug]`、`DetailPage.tsx:542`）またはプロフィール統計（`ProfilePage.tsx:241-254`）に「N 種を観察」等の進捗カウンタを表示する。初回可視時に **0→N のカウントアップ演出**を任意で付与してよいが、以下を厳守：
  - 数値（最終 N）は JS で算出し、**アニメの有無に関わらず最終値が DOM に確実に出る**静的フォールバックを持つ（演出は装飾、値は本体）。
  - スクロール連動を使う場合 CSS `animation-timeline: scroll()` は Safari 未対応のため**採用しないか**、採用しても上記フォールバックで非対応ブラウザに最終値が表示されること。`IntersectionObserver`＋ JS カウントアップ（reduced-motion では即時 N 表示）を推奨案とする。
  - 「N 種」の集計元は既存指標（例: `get_user_diversity` の `species_count`／`useProfile` 系、`ProfilePage.tsx` の `municipality_count`）を再利用し、新規 RPC 追加は避ける。地域単位の集計が既存に無い場合は本 FR の範囲を「プロフィールの観察進捗カウンタ」に限定してよい（地域版は別途 REQ 化可）。

- [ ] FR-226-08: **達成感アニメ用の軽量キーフレームを `globals.css` に追加する。** `transform`/`opacity` のみで構成した再利用可能なキーフレーム（例: `like-pop`・`badge-unlock`・`count-up` 用の `fade-up`）を `globals.css` に定義し、duration 100〜300ms・入場 ease-out を既定とする。既存 `fadeSlideIn`（303行）で足りる用途は流用し、重複定義を避ける。`globals.css:63-70` のグローバル `prefers-reduced-motion` 抑制が新規キーフレームにも効くことを確認する。

- [ ] FR-226-09: **新規ユーザー向け文言を i18n 4 ロケールで定義する。** 本 REQ で追加するトースト文言・バッジ解放ラベル・進捗カウンタ文言（例 `achievement.commentPosted`・`achievement.badgeUnlocked`・`achievement.speciesObserved`）を ja/en/ko/zh（`src/locales/{ja,en,ko,zh}/translation.json`）すべてに追加する。LP のブランディング方針（やさしい言葉・大学名/「卒業研究」NG）に反しない平易な表現にする。
