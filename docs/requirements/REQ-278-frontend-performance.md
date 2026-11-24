# REQ-278: フロントエンド性能改善（毎遷移RPC・静的AuthModal・先行3フェッチ等）

優先度: **P1** ／ 深刻度: **Medium** ／ 種別: パフォーマンス

## 背景

過去REQ（144/145/190/191/199/250 等）で主要領域は最適化済み。残存する実効性のある課題:

### 問題A: DrawerMenu が閉じたまま全ページ遷移ごとに進捗RPCを発火 — Medium
`src/components/layout/DrawerMenu.tsx:41` の `useProgress(user?.id)` はマウント時に無条件で `get_user_progress` RPC を発火（キャッシュ無し）。DrawerMenu は Header から `open` prop で**常時マウント**されるため、ログインユーザーはページ遷移のたびに、閉じたドロワーのヒートマップ解放判定のためだけにRPCを1本無駄撃ちする。

### 問題B: `/post/[id]` だけ AuthModal を静的import — Medium
`src/views/DetailPage.tsx:12`。HomePage/SurveyRequestPage/SurveyRequestsListPage は全て `dynamic(() => import(...), { ssr:false })` 済み。AuthModal は648行＋Turnstile関連を抱え、SNS共有の主要着地ページ型 `/post/[id]` の First Load JS に常時同梱される（未ログイン閲覧者の大半には不要）。`/post/[id]` は `.size-limit.json` の予算対象外で肥大を検知できない。

### 問題C: RankingPage が表示1タブに対し3系統RPCを一斉フェッチ — Medium
`src/views/RankingPage.tsx:83-85`。`useRanking`/`useDiversity`/`useQuality` がマウント時に全て自動フェッチ。既定表示は diversity のみで、残り2本はタブを押すまで不要。

### 問題D（Low）
- `DetailPage.tsx:112` の `comments(*)` ワイルドカード埋め込み（列限定・上限なし）→ 列明示化
- `PhotoGallery.tsx:32-34` の派生配列が毎レンダー再計算 → `useMemo`
- `useAdminPosts.ts:295` bulkApprove の逐次UPDATE → `.in('id', ids)` 一括化（監査ログ設計と要調整のため任意）

## 機能要件

- **FR-278-01**: `useProgress` を「ドロワーが開いたとき初回フェッチ」にする（`open` 連動の enabled 化、または `open && <DrawerContent/>` 分割）。ヒートマップ解放判定の挙動（フェイルオープン）は維持する。
- **FR-278-02**: DetailPage の AuthModal を他ページと同じ dynamic import に統一する。
- **FR-278-03**: RankingPage の3フックへ `enabled` 相当を導入し、アクティブタブのフェッチのみ発火・タブ初回切替時に遅延フェッチする。
- **FR-278-04**: DetailPage の `comments(*)` を必要列（`id, post_id, user_id, content, is_admin, created_at` 等、CommentSection の表示要件に一致）へ明示化する。
- **FR-278-05**: PhotoGallery の `items` を `useMemo` 化する。

## 受入基準

- **AC-01**: ログイン状態でページ遷移してもドロワー未開なら `get_user_progress` が発火しない（開いた時に1回発火）。
- **AC-02**: `/post/[id]` の First Load JS が現状より減少する（`next build` の出力で確認）。
- **AC-03**: /ranking 初期表示で発火するRPCが1本になり、タブ切替で残りが遅延フェッチされる。
- **AC-04**: `lint` / `type-check` / 既存テストパス。

## 対象外

- bulkApprove 一括化（監査ログの1件毎記録という現仕様との調整が必要なため、本REQでは見送り可）。
- `/post/[id]` の size-limit 予算追加（REQ-281 に記録）。
