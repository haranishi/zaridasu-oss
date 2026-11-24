### G. 横はみ出し・BottomNav との重なり

- **G-1 /dataset 横スクロール**: `src/app/dataset/page.tsx:182-184` — API例の `<code>` に折返し指定が無く、約88文字の空白なし文字列（`/dataset/zaridasu.geojson?species=american&municipality=...`）が 375px を大きく超過し**ページ全体が横スクロール**する。
- **G-2 テーブルのラップ漏れ（admin）**: `AdminAiCostPage.tsx:174`・`AdminExperimentsPage.tsx:116` — `overflow-x-auto` ラッパー無し（他の管理テーブルは対応済みでばらつき）。
- **G-3 セーフティネット不在**: `globals.css` の html/body に `overflow-x: hidden` ガードが無い（G-1 の実害を全ページ波及型にしている）。
- **G-4 PhotoGallery 最終行が BottomNav に隠れる**: `PhotoGallery.tsx:64` `h-full overflow-y-auto` に下パディング無し（`PostList.tsx:110` は `pb-20` 対応済みで不一致）。
- **G-5 /requests の FAB オフセット過大**: `SurveyRequestsListPage.tsx:227-228` — FAB が `bottom: calc(safe + 5rem)` と BottomNav 分を空けるが、`/requests` は `BottomNav.tsx:25` の `VISIBLE_PATHS` に無くナビ非表示 → 80px の無駄な空隙。かつ一覧側（`:95`）に FAB 分の下余白が無く最下段カードに FAB が重なり得る。

### H. その他のモバイル UX

- **H-1 BarChart の件数が hover 依存**: `BarChart.tsx:22` `opacity-0 group-hover:opacity-100` — タッチ端末では月別件数が読めない（/trends と /dashboard KPI の双方に影響）。
- **H-2 背景スクロールロック欠如**: body ロックは PhotoViewer と Header ドロワーのみ。PostForm/AuthModal/SurveyRequestForm/EditProfileModal/ReportModal/EditDialog/各ダイアログは**モーダル表示中に背後ページがスクロールする**（iOS のラバーバンドで顕著）。
- **H-3 admin 系モーダルの focus trap / Esc / 背景クリック閉じ欠如**: UserDetailModal（`AdminUsersPage.tsx:47-142`）、権限 ConfirmDialog（`:153-189`）、一括操作ダイアログ（`AdminPostsPage.tsx:584-628`）、`AdminReportsPage.tsx:52-73`・`AdminCommentsPage.tsx:38`。PhotoViewer もフォーカストラップ無し。
- **H-4 /u/unsubscribe がダークモード非対応**: `UnsubscribePage.tsx:70-127` — `dark:` バリアントゼロ。
- **H-5 3D水槽が `frameloop="always"`**: `Crayfish3DViewer.tsx:248` — 静止中も毎フレーム描画しモバイルの電池/GPU を消費。
- **H-6 軽微**: ランキング3タブが375pxで窮屈（`RankingPage.tsx:119-154`）、/about の禁止事項2列が窮屈（`AboutPage.tsx:159,185`）、全画面ローディングの Loader2 残存（AuthCallbackPage/UnsubscribePage、スケルトン基盤 `Skeleton.tsx` は完備）、focus-visible 統一未達（`focus:ring-2` 31件 vs `focus-visible:ring-2` 1件）、DrawerMenu フッターに pb-safe 無し（`DrawerMenu.tsx:60/248`）、landscape で地図凡例と Photos エッジハンドルが重なる可能性（`MapView.tsx:592-652`×`HomePage.tsx:424`）。

### 良好で変更不要な点（再確認済み）

PostForm（dvh/landscape/safe-area/16px入力の模範実装）、3D水槽の WebGL フォールバックと dynamic import、LP 全般（`overflow-x-clip`・clamp 流体タイポ・マーキー一時停止）、管理テーブルのモバイルカード化（旧 FR-001）、BottomNav 表示4ページの `pb-20`、Toast 位置、`min-[400px]:grid-cols-2` 等のグリッド、`prefers-reduced-motion` 対応、UnlockCelebration。旧要件の US-002 AC-4（キーボード時スクロール）・US-005 AC-2/3（チャートラベル・ランキング）は**解決済みと判定**。
