```
│
├── B-6: 機能コンポーネント - 投稿系 (6ファイル)
│   ├── features/posts/PostCard.jsx        → .tsx
│   ├── features/posts/PostForm.jsx        → .tsx
│   ├── features/posts/PostList.jsx        → .tsx
│   ├── features/posts/LocationPicker.jsx  → .tsx
│   ├── features/posts/CommentSection.jsx  → .tsx
│   └── features/posts/LikeShareSection.jsx → .tsx
│
├── B-7: 機能コンポーネント - 地図・ホーム・認証 (4ファイル)
│   ├── features/map/MapView.jsx           → .tsx
│   ├── features/map/MiniMap.jsx           → .tsx
│   ├── features/home/MiniProfile.jsx      → .tsx
│   └── features/auth/SignupBanner.jsx     → .tsx
│
├── B-8: モーダルコンポーネント (5ファイル)
│   ├── modals/AuthModal.jsx       → .tsx
│   ├── modals/EditDialog.jsx      → .tsx
│   ├── modals/DeleteDialog.jsx    → .tsx
│   ├── modals/ReportModal.jsx     → .tsx
│   └── modals/SurveyRequestForm.jsx → .tsx
│
├── B-9: 管理画面コンポーネント (11ファイル)
│   ├── features/admin/RecentPostsCard.jsx    → .tsx
│   ├── features/admin/AreaChart.jsx          → .tsx
│   ├── features/admin/AdminDonutChart.jsx    → .tsx
│   ├── features/admin/AdminStatCard.jsx      → .tsx
│   ├── features/admin/DateRangePicker.jsx    → .tsx
│   ├── features/admin/MunicipalityRanking.jsx → .tsx
│   ├── features/admin/SummaryCard.jsx        → .tsx
│   ├── features/admin/BulkActionBar.jsx      → .tsx
│   ├── features/admin/ReviewCard.jsx         → .tsx
│   ├── features/admin/ReviewCardMiniMap.jsx  → .tsx
│   └── features/admin/ReviewCardAI.jsx       → .tsx
│
├── B-10: ダッシュボードコンポーネント (9ファイル)
│   ├── features/dashboard/MyPostsSection.jsx → .tsx
│   ├── features/dashboard/FilterBar.jsx      → .tsx
│   ├── features/dashboard/BadgeSection.jsx   → .tsx
│   ├── features/dashboard/CSVExportSection.jsx → .tsx
│   ├── features/dashboard/EmailVerificationBanner.jsx → .tsx
│   ├── features/dashboard/KPISection.jsx     → .tsx
│   ├── features/dashboard/StatsBar.jsx       → .tsx
│   ├── features/dashboard/TrendsKPI.jsx      → .tsx
│   └── features/dashboard/PendingPostsSection.jsx → .tsx
│
└── B-11: ビューコンポーネント (13ファイル)
    ├── views/HomePage.jsx          → .tsx
    ├── views/DetailPage.jsx        → .tsx
    ├── views/DashboardPage.jsx     → .tsx
    ├── views/TrendsPage.jsx        → .tsx
    ├── views/RankingPage.jsx       → .tsx
    ├── views/ProfilePage.jsx       → .tsx
    ├── views/AboutPage.jsx         → .tsx
    ├── views/TermsPage.jsx         → .tsx
    ├── views/PrivacyPage.jsx       → .tsx
    ├── views/NotFoundPage.jsx      → .tsx
    ├── views/OfflinePage.jsx       → .tsx
    ├── views/SurveyRequestPage.jsx → .tsx
    ├── views/AuthCallbackPage.jsx  → .tsx
    └── views/admin/ (8ファイル)    → .tsx
```

### 移行方針

- **型定義**: `src/types/index.ts` の既存型を活用
- **strict モード**: 段階的に有効化（まず `false` で移行、後に `true`）
- **Props 型**: コンポーネントごとに interface/type を定義
- **Supabase 型**: `database.types.ts` の型を活用

---
