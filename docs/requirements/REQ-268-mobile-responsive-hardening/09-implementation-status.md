## 実装状況（2026-07-12）

- **P1（FR-268-01〜05）実装完了**（commit d68d59a）: viewport-fit=cover / h-dvh / モーダル z-[430] 統一（InstallBanner は nav 表示時のみオフセット）/ モーダル max-h・dvh・safe-area / iOS 16px 入力。
- **P2（FR-268-06〜11）実装完了**（commit bf464cc）: 44px タッチターゲット（Leaflet ズーム・Header・地図コントロール・FilterBar・各モーダル閉じる・コメント操作・写真削除・3D・チップ等）/ useBodyScrollLock 新設＆全モーダル適用 / 横はみ出し（dataset code break-all・admin テーブル overflow-x-auto・html overflow-x:clip）/ BottomNav 重なり（PhotoGallery・/requests FAB）/ BarChart 件数常時表示 / 極小フォント是正。
- **P3（FR-268-12〜13）一部実装**（commit 予定）:
  - FR-268-12: **UserDetailModal・AdminUsersPage の ConfirmDialog** に focus trap / Esc / 背景クリック / scroll lock を付与。**残（follow-up）**: AdminPostsPage 一括操作ダイアログ・AdminReportsPage / AdminCommentsPage の ConfirmDialog・PhotoViewer の focus trap（いずれも admin 中心・二次オーディエンス）。
  - FR-268-13: **(a) UnsubscribePage ダークモード対応・(b) 3D frameloop を autoplay 連動 demand 化＋drag/nudge invalidate・(c) ランキングタブ py-2.5・(d) AboutPage 禁止事項をモバイル 1 列・(g) DrawerMenu フッター pb-safe** を実装。**残（follow-up・任意）**: (e) AuthCallback/Unsubscribe の全画面 Loader2 をスケルトン化・(f) `focus:ring-2`→`focus-visible:ring-2` の全体統一（広域置換のため別途）・(h) landscape での地図凡例最大高制限（実機 landscape 検証が必要）。
