## Step 3: 機能要件

### FR-001: セキュリティヘッダー追加
- **説明:** CSP, HSTS, X-XSS-Protection を next.config.ts の headers() に追加
- **対象ファイル:** `next.config.ts`
- **処理:**
  - Content-Security-Policy: `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://nominatim.openstreetmap.org https://api.open-meteo.com; font-src 'self'; frame-src 'none'`
  - Strict-Transport-Security: `max-age=31536000; includeSubDomains`
  - X-XSS-Protection: `1; mode=block`
- **バリデーション:** Leaflet タイルURL・Supabase URL・GA・OpenStreetMap API が CSP で許可されていること
- **エラーハンドリング:** CSP 違反はブラウザコンソールにレポートされる（report-uri は将来対応）

### FR-002: RLSポリシー整理
- **説明:** posts テーブルの public_insert と auth_insert の競合を解消
- **対象ファイル:** `supabase/schema.sql`, 新規マイグレーション
- **処理:**
  - `public_insert` ポリシーを DROP
  - `auth_insert` ポリシーのみ残す（認証ユーザーのみ投稿可能）
- **影響範囲:** 匿名投稿は is_anonymous フラグで制御（認証済みユーザーが匿名投稿を選択）

### FR-003: 入力値バリデーション強化
- **説明:** クライアントサイドの入力値検証を強化
- **対象ファイル:** `src/hooks/usePostForm.ts`, `src/hooks/useSurveyRequests.ts`
- **バリデーション:**
  - count: 0〜9999 の整数、NaN/Infinity 排除
  - lat: 38.7〜40.5（秋田県範囲）
  - lng: 139.5〜140.8（秋田県範囲）
  - reason: 最大500文字（トリム後）
  - species: SPECIES 定数の value に含まれること
  - comment: 最大500文字（トリム後）
- **エラーハンドリング:** バリデーション失敗時は toast.error() で表示

### FR-004: ミドルウェア JWT検証強化
- **説明:** getSession() → getUser() へ切り替え（管理者ルートのみ）
- **対象ファイル:** `src/lib/supabase/middleware.ts`
- **処理:**
  - `/admin/*` ルート: `getUser()` でDB検証（セキュリティ優先）
  - `/dashboard/*` ルート: `getSession()` のまま（パフォーマンス優先）
- **トレードオフ:** 管理者ルートのみDB呼出しが発生するが、管理者アクセスは低頻度なので許容

### FR-005: Next.js Image コンポーネント移行
- **説明:** 22箇所の `<img>` を Next.js `<Image>` に置換
- **対象ファイル:** PostCard, ReviewCard, PendingPostsSection, MyPostsSection, StatsBar, PhotoViewer, DetailPage, ProfilePage, AboutPage, AdminPostsPage, EditDialog, SurveyRequestForm, PostForm, MapView（15ファイル）
- **処理:**
  - ローカル画像（/images/*）: `import` + width/height 指定
  - Supabase Storage 画像: `fill` + `sizes` + `loading="lazy"`
  - Blob URL（オフラインキュー）: `<img>` のまま残す（Next.js Image は Blob URL 非対応）
- **バリデーション:** next.config.ts の remotePatterns が Supabase URL をカバーしていること

### FR-006: Context値メモ化
- **説明:** AuthContext, ThemeContext, ToastContext の Provider value を useMemo で包む
- **対象ファイル:** `src/context/AuthContext.tsx`, `src/context/ThemeContext.tsx`, `src/context/ToastContext.tsx`
- **処理:**
  ```typescript
  // AuthContext
  const value = useMemo(() => ({
    user, loading, signOut, deleteAccount, isAdmin, isEmailConfirmed
  }), [user, loading, isAdmin, isEmailConfirmed])
  // signOut, deleteAccount は useCallback で安定化
  ```

### FR-007: AbortController 導入
- **説明:** 6つの hooks に非同期リクエストのキャンセル制御を追加
- **対象ファイル:** `useStats.ts`, `useAdminStats.ts`, `usePostList.ts`, `useProfile.ts`, `useSurveyRequests.ts`, `useSurveyRequest.ts`
- **処理:**
  - useEffect のクリーンアップで AbortController.abort()
  - Supabase クエリには `.abortSignal(signal)` を付与
  - fetch API 呼出しには `{ signal }` オプションを付与
  - AbortError は無視（正常なキャンセル）

### FR-008: 管理画面チャート遅延読み込み
- **説明:** AreaChart, AdminDonutChart を dynamic() で遅延読み込み
- **対象ファイル:** `src/views/admin/AdminDashboard.tsx`（インポート元）
- **処理:**
  ```typescript
  const AreaChart = dynamic(() => import('@/components/features/admin/AreaChart'), { ssr: false })
  const AdminDonutChart = dynamic(() => import('@/components/features/admin/AdminDonutChart'), { ssr: false })
  ```

### FR-009: キャッシュヘッダー設定
- **説明:** 静的アセット用の Cache-Control ヘッダーを設定
- **対象ファイル:** `next.config.ts`
- **処理:**
  ```typescript
  {
    source: '/images/:path*',
    headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }]
  }
  ```
  - Next.js は `/_next/static/` に自動で immutable キャッシュを設定済み
