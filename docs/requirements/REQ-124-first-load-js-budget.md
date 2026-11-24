# REQ-124: ホーム / 管理投稿ページの First Load JS を削減し体感速度を改善する

## 背景
直近のビルド計測でホーム `/` の First Load JS が約 292 kB、`/admin/posts` が約 324 kB。地図・写真ギャラリー・統計・管理機能を盛り込んだ結果、モバイル（4G 相当）の地方ユーザーで LCP / TTI が体感悪化しやすい段階に来ている。`size-limit` はチャンク単位で監視しているが、First Load 全体の上限は設定されていない。

`MapView` / `PostForm` / `SurveyRequestForm` は既に `dynamic({ ssr: false })` で遅延ロードされている。次の一手は、初回描画に必須でないコンポーネントの追加遅延化、AdminPostsPage のモノリス分割、地図系プラグイン（leaflet.heat / react-leaflet-cluster）のロード戦略見直し。

## 現状の問題

### 1. ホーム `/` の First Load JS ≒ 292 kB
`src/app/(home)/HomeInteractive.tsx` が描画する以下が初期バンドルに乗りやすい：
- `Header`, `BottomNav`, `FilterBar`（同期 import）
- `usePostList` / `useSurveyRequests`（直 import の Supabase クライアント）
- 既に動的化済み: `MapView`, `PostForm`, `SurveyRequestForm`

未動的化で重そうなもの：
- `PhotoGallery`（写真パネル切替時のみ表示だが同期 import）
- `SignupBanner`（未ログイン時のみ）
- `AuthModal`（モーダル表示時のみ）
- 地図プラグイン: `react-leaflet-cluster`, `leaflet.heat`（MapView 内で常時 import？要確認）

### 2. `/admin/posts` の First Load JS ≒ 324 kB
`src/views/admin/AdminPostsPage.tsx` が **734 行のモノリス**。1 コンポーネントにフィルタ・一覧フェッチ・bulk 操作・モーダル（PhotoViewer / MapModal / DeletePostDialog / RejectDialog）・AIBadge・ReviewCard 等が同居しており、ページに入った瞬間にすべてが読み込まれる。

### 3. size-limit はチャンク単位、First Load 全体の予算は未管理
`.size-limit.json` で home `10 KB`、admin/posts `15 KB` を gzip 監視しているが、これは**ページ固有 chunk のみ**。共通 chunk（framework, vendors, app shell）が膨らんでも検知できない。

### 4. bundle-analyzer 結果の継続観測がない
`npm run analyze` は手動実行で、CI 上の経時変化は見ていない。

## 目的
- 初回描画 chunk から「初期描画に必須でないコード」を切り出す。
- モバイル LCP を改善する。
- バンドルサイズの劣化を size-limit で継続監視する。

## 要件

### 機能要件
- [ ] FR-124-01: `npm run analyze` を実行し、ホーム / `/admin/posts` の依存ツリーを把握。重い依存トップ 5 を本要件のレポートに追記する。
- [ ] FR-124-02: 以下を `dynamic({ ssr: false })` に変更する候補として検討し、効果のあるものを実施：
  - `AuthModal`（モーダル表示時のみ）
  - `SignupBanner`（未ログイン時のみ）
  - `PhotoGallery`（写真パネル切替時、初期は地図のみ表示）
- [ ] FR-124-03: `MapView` 内の `react-leaflet-cluster` / `leaflet.heat` を「クラスタ表示が必要になったとき」に limit して動的に import する（既に対応済みなら測定で確認）。
- [ ] FR-124-04: `AdminPostsPage.tsx`（734 行）を以下に分割する：
  - `useAdminPosts` フック（フェッチ・bulk 操作・filter ロジック）
  - `AdminPostsFilters` コンポーネント
  - `AdminPostsRow` / `AdminPostsList` コンポーネント
  - 既存の `BulkActionBar` / `ReviewCard` / `AIBadge` の外出しは維持
  - 各モーダルは既に外部化済みなので import を維持
- [ ] FR-124-05: `AdminPostsPage` のモーダル群（`PhotoViewer`, `MapModal`, `DeletePostDialog`, `RejectDialog`）を `dynamic({ ssr: false })` 化し、開いたときだけロードする。
- [ ] FR-124-06: `.size-limit.json` に「First Load JS 全体の上限」を追加する：
  - `/`: 250 KB（gzip）以下を目標
  - `/admin/posts`: 280 KB（gzip）以下を目標
  - 上限値はビルド計測値の -10〜15% に設定して劣化を検知
- [ ] FR-124-07: CI（`.github/workflows/ci.yml`）で `npm run size` を必須ステップとし、超過したら fail させる（既に動いているなら閾値の見直しのみ）。

### 非機能要件
- [ ] NFR-124-01: 主要画面の描画機能に回帰を出さない（既存 E2E で担保 + 手動 smoke）。
- [ ] NFR-124-02: 動的 import 化したコンポーネントには適切な loading skeleton を出す（描画ガタつき防止）。
- [ ] NFR-124-03: Lighthouse Performance スコアを REQ-109 の閾値（既存）から **下げない**こと。

## 受入条件
- [ ] AC-01: `npm run build` 後、`/` の First Load JS が 250 KB 以下（gzip）。
- [ ] AC-02: `npm run build` 後、`/admin/posts` の First Load JS が 280 KB 以下（gzip）。
- [ ] AC-03: `npm run size` が pass する。CI で size-limit 超過時に fail することをドライランで確認。
- [ ] AC-04: ホーム表示時、地図と FilterBar 以外のチャンクは Network タブで「初回には来ない」ことを目視確認（DevTools）。
- [ ] AC-05: `/admin/posts` を開いた時、初期表示に不要なモーダル系チャンクが Network タブで遅延ロードされる。
- [ ] AC-06: 既存 E2E（home, post, admin-guard, survey-request）が緑のまま。
- [ ] AC-07: 既存ユニットテスト（PostCard, AdminPostsPage 等）が緑のまま。AdminPostsPage のテストは分割後の入り口コンポーネントに対応する形に修正。
- [ ] AC-08: Lighthouse モバイル Performance スコアが既存閾値（REQ-109）以上。

## 影響範囲
- 変更対象ファイル
  - `src/app/(home)/HomeInteractive.tsx`
  - `src/views/admin/AdminPostsPage.tsx`（分割）
  - `src/views/admin/__tests__/AdminPostsPage.test.tsx`
  - `src/components/features/posts/PhotoGallery.tsx`（dynamic 化対応）
  - `src/components/features/auth/SignupBanner.tsx`（dynamic 化対応）
  - `src/components/modals/AuthModal.tsx`（dynamic 化対応）
  - `src/components/features/map/MapViewWrapper.tsx`（クラスタ/heat の遅延 import）
  - `.size-limit.json`
  - `.github/workflows/ci.yml`（既に size を呼んでいなければ追加）
- 影響しないこと
  - DB スキーマ・RLS・Edge Functions
  - 投稿・調査依頼の送信ロジック

## 優先度
- **緊急度**: Medium
- **重要度**: High
- **理由**: 機能は壊れていないが、市民参加型サービスで「読み込みが遅くて離脱する」のは投稿数の頭打ちに直結する。AdminPostsPage の分割は次の管理機能追加（ AI 判定 UI など）の保守性にも効く。比較的安全に段階リリースできるためいつ着手してもよいが、機能追加が走る前にやっておくと後段が楽になる。
