## 影響範囲

**変更対象（主要）:**

| 領域 | ファイル |
|---|---|
| 基盤 | `src/app/layout.tsx`（viewport export）、`src/app/globals.css`（overflow-x ガード・leaflet-bar 44px）、`src/views/HomePage.tsx`、`src/views/DetailPage.tsx` |
| モーダル | `src/components/modals/`（AuthModal / SurveyRequestForm / EditProfileModal / ReportModal / EditDialog / MapModal / RejectDialog）、`src/views/DashboardPage.tsx`、新規 `src/hooks/useBodyScrollLock.ts` |
| 地図/ホーム | `src/components/features/map/MapView.tsx`、`src/components/features/dashboard/FilterBar.tsx`、`src/components/features/posts/PhotoGallery.tsx`、`src/components/layout/Header.tsx`、`src/components/layout/DrawerMenu.tsx`、`src/components/features/auth/SignupBanner.tsx`、`src/components/ui/InstallBanner.tsx` |
| 新規ページ群 | `src/views/SurveyRequestsListPage.tsx`、`src/views/SurveyRequestPage.tsx`、`src/app/dataset/page.tsx`、`src/app/species/[species]/page.tsx`、`src/views/AreaPage.tsx`、`src/views/RankingPage.tsx`、`src/views/AboutPage.tsx`、`src/views/UnsubscribePage.tsx`、`src/components/features/collection/`（Crayfish3DViewer / Crayfish3DStage / SpeciesDexCard） |
| チャート | `src/components/ui/charts/BarChart.tsx` |
| admin | `src/views/admin/`（AdminUsersPage / AdminPostsPage / AdminReportsPage / AdminCommentsPage / AdminLogsPage / AdminAiCostPage / AdminExperimentsPage）、`src/components/ui/PhotoViewer.tsx`、`src/components/features/posts/PhotoUploadSection.tsx` |

**他機能への影響:**
- FR-268-01（viewport-fit=cover）はビューポートがノッチ下まで広がるため、safe-area padding が**未設定の fixed 要素**が新たに露出しないか全 fixed 要素の確認が必要（Header/BottomNav/PostForm/SignupBanner は対応済み）。
- FR-268-08(c) の body `overflow-x: hidden` は `position: sticky` の祖先制約と干渉し得るため、ヘッダー sticky（PostForm 内等）の動作確認が必要。
- e2e への追加推奨: AC-01（横スクロール無し）と AC-02（モーダル時のナビ不活性）は Playwright で自動化可能（viewport 375×667 指定）。

## 優先度

- **緊急度**: High
- **重要度**: High
- **理由**: 主要利用シーンがスマホ野外での投稿であり、B（モーダル中にナビが押せる）・C-1（プロフィール編集の保存に到達不能）・D（フォーカスの度に勝手にズーム）・G-1（/dataset 横スクロール）は現行本番で実ユーザーに顕在化している不具合。A-1 は PWA 利用者のレイアウト崩れに直結する。一方データ破壊やセキュリティの問題ではないため Critical ではない。P1（FR-01〜05）→ P2（FR-06〜11）→ P3（FR-12〜13）の順で段階実装し、各段階で AC-11（既存テスト green）を確認する。
