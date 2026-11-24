## 背景
プロジェクトのカスタムフック・ユーティリティ・管理画面に対するテストカバレッジが大幅に不足している。19 個のフック中 6 個、14 個の lib モジュール中 2 個、4 個の utils モジュール中 2 個しかテストが存在せず、管理画面ビュー（8 ファイル）にはテストがゼロである。

## 現状の問題

### カスタムフック (`src/hooks/`)
19 ファイル中 **6 ファイルのみ** テスト有り（カバレッジ 31.6%）:

| フック | 行数 | テスト | 重要度 |
|--------|------|--------|--------|
| useAdminStats.ts | 173 | **なし** | Critical - DB 集計ロジック |
| useCsvExport.ts | - | **なし** | Medium |
| useDeletePost.ts | - | あり | - |
| useDetailSEO.ts | - | **なし** | Low |
| useEditPost.ts | - | あり | - |
| useEmailResend.ts | - | **なし** | Medium |
| useEscapeKey.ts | - | **なし** | Low |
| useFocusTrap.ts | - | **なし** | Medium - アクセシビリティ |
| useLike.ts | 76 | **なし** | High - ユーザー向け主要機能 |
| useOfflineQueue.ts | 159 | **なし** | Critical - オフライン対応 |
| usePostDraft.ts | - | **なし** | Medium |
| usePostForm.ts | - | あり | - |
| usePostList.ts | - | あり | - |
| useProfile.ts | - | あり | - |
| useReverseGeocode.ts | - | あり | - |
| useStats.ts | - | **なし** | Medium |
| useSurveyRequests.ts | - | **なし** | Medium |
| useToast.ts | - | **なし** | Low |
| useWeather.ts | - | **なし** | Low |

### ライブラリ (`src/lib/`)
14 ファイル中 **2 ファイルのみ** テスト有り（カバレッジ 14.3%）:

| モジュール | 行数 | テスト | 重要度 |
|------------|------|--------|--------|
| auditLog.ts | - | **なし** | High - 監査ログ |
| constants.ts | - | あり | - |
| dateLocales.ts | - | **なし** | Low |
| formStyles.ts | - | **なし** | Low |
| geocodeCache.ts | - | **なし** | Medium |
| i18n.ts | - | **なし** | Low |
| imageProcessor.ts | 149 | **なし** | Critical - 画像リサイズ/圧縮 |
| imageUtils.ts | - | **なし** | Medium |
| offlineStore.ts | 125 | **なし** | Critical - IndexedDB 永続化 |
| postValidation.ts | - | あり | - |
| rpcThrottle.ts | - | **なし** | High - レート制限 |
| seo.ts | - | **なし** | Low |
| themeClasses.ts | - | **なし** | Low |
| weatherIcons.tsx | - | **なし** | Low |

### ユーティリティ (`src/utils/`)
4 ファイル中 **2 ファイルのみ** テスト有り（カバレッジ 50%）:

| モジュール | テスト | 重要度 |
|------------|--------|--------|
| cn.ts | **なし** | Low |
| errorHandler.ts | あり | - |
| municipalityLabel.ts | **なし** | Medium |
| storage.ts | あり | - |

### 管理画面ビュー (`src/views/admin/`)
8 ファイル、テストディレクトリ自体が存在しない（カバレッジ **0%**）:
- AdminCommentsPage.tsx
- AdminDashboard.tsx
- AdminLayout.tsx
- AdminLoginPage.tsx
- AdminLogsPage.tsx
- AdminPostsPage.tsx (877 行)
- AdminReportsPage.tsx
- AdminUsersPage.tsx

