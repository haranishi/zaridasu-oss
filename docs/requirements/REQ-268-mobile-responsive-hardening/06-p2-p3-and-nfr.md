### 機能要件（P2: 操作性・可読性）

- [ ] FR-268-06: E 節の全タッチターゲットを 44×44px 以上にする。原則: 可視サイズを変えられない場合は `min-h-11 min-w-11` か `before:` 疑似要素で当たり判定のみ拡大。Leaflet 既定ズームは `globals.css` に `.leaflet-touch .leaflet-bar a { width: 44px; height: 44px; line-height: 44px; }` を追加（または `zoomControl={false}` + 自前UI）。**最優先は「コメント削除18px」「EditDialog 写真削除16px」「bounds解除×22px」の3つ**。
- [ ] FR-268-07: モーダル共通の背景スクロールロックを導入する。`useBodyScrollLock()` フック（`position: fixed` + scrollY 復元方式。iOS ラバーバンド対応）を新設し、PostForm/AuthModal/SurveyRequestForm/EditProfileModal/ReportModal/EditDialog/MapModal/各確認ダイアログに適用（PhotoViewer/Header ドロワーの既存実装も共通化）。
- [ ] FR-268-08: 横はみ出しの根絶。(a) `dataset/page.tsx:182-184` の `<code>` に `break-all` を付与。(b) `AdminAiCostPage.tsx:174`・`AdminExperimentsPage.tsx:116` のテーブルを `overflow-x-auto` でラップ。(c) `globals.css` の body に `overflow-x: hidden`（または `clip`）のセーフティネットを追加（地図・横スクロールUIへの副作用が無いことを確認の上）。
- [ ] FR-268-09: BottomNav との重なり解消。(a) `PhotoGallery.tsx:64` のスクロール内容に `pb-20`（+ `pb-safe`）。(b) `SurveyRequestsListPage.tsx:227-228` の FAB を `bottom: calc(env(safe-area-inset-bottom) + 1.5rem)` に是正し、一覧コンテナ（`:95`）に `pb-24` を追加。
- [ ] FR-268-10: `BarChart.tsx:22` の件数表示を hover 非依存にする（バー上に常時 `text-[11px]` で件数表示、または棒タップで表示。`title` 属性は補助のまま維持）。
- [ ] FR-268-11: 極小フォント是正。9px 3箇所（`FilterBar.tsx:152/175`・`PhotoGallery.tsx:98`）を 10px 以上へ、情報を担う 10px（`MapView.tsx:644/648` 凡例・`PhotoGallery.tsx:91/96`・`BarChart.tsx:40` の下限）を 11px 以上へ。

### 機能要件（P3: 品質・任意）

- [ ] FR-268-12: admin 系モーダルの共通化（focus trap / Esc / 背景クリック閉じ）。`useFocusTrap` + `useEscapeKey` を UserDetailModal・権限 ConfirmDialog・一括操作ダイアログ・AdminReportsPage/AdminCommentsPage の ConfirmDialog に適用し、PhotoViewer にもフォーカストラップを追加。
- [ ] FR-268-13（任意）: (a) `UnsubscribePage.tsx` のダークモード対応。(b) `Crayfish3DViewer.tsx:248` を `frameloop="demand"` + 操作時 `invalidate()` へ。(c) ランキング3タブのラベル短縮 or `py-2.5` 化。(d) `AboutPage.tsx:159,185` をモバイル `grid-cols-1` に。(e) AuthCallbackPage/UnsubscribePage の全画面 Loader2 をスケルトン/LoadingState へ統一。(f) `focus:ring-2` → `focus-visible:ring-2` への段階統一（旧 LOW#9）。(g) `DrawerMenu.tsx:248` フッターに `pb-safe`。(h) landscape での地図凡例最大高制限。

### 非機能要件

- [ ] NFR-268-01: 変更は UI 層（クラス・スタイル・z-index・フック）に閉じ、データフロー・API・DB・i18n キーを変更しない。
- [ ] NFR-268-02: 既存テストグリーン維持（unit 627 / e2e 33 / build / size-limit / perf-budget）。First Load JS 予算を増やさない（新規依存の追加禁止。scroll-lock 等は自前実装）。
- [ ] NFR-268-03: 拡大操作（ピンチズーム）を禁止しない（`maximumScale=1`/`user-scalable=no` を導入しない。WCAG 1.4.4）。
- [ ] NFR-268-04: SW 更新・オフライン動作・地図のタッチ操作（ピンチ/ドラッグ/スワイプページャ）に回帰を出さない。
