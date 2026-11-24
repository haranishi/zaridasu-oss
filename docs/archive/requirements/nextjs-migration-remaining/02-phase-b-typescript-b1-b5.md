## Phase B: TypeScript 全面移行

### 目的
全 `.jsx` / `.js` ファイルを `.tsx` / `.ts` に変換し、型安全性を確保する。

### スキル構成図

```
Phase B: TypeScript 移行
├── B-1: Context プロバイダー (3ファイル)
│   ├── context/AuthContext.jsx    → .tsx  (認証状態管理)
│   ├── context/ThemeContext.jsx   → .tsx  (ダークモード)
│   └── context/ToastContext.jsx   → .tsx  (トースト通知)
│
├── B-2: カスタムフック (12ファイル)
│   ├── hooks/useProfile.js        → .ts
│   ├── hooks/useLike.js           → .ts
│   ├── hooks/useSurveyRequests.js → .ts
│   ├── hooks/useStats.js          → .ts
│   ├── hooks/useAdminStats.js     → .ts
│   ├── hooks/useCsvExport.js      → .ts
│   ├── hooks/useDetailSEO.js      → .ts
│   ├── hooks/useEditPost.js       → .ts
│   ├── hooks/useEmailResend.js    → .ts
│   ├── hooks/useToast.js          → .ts
│   └── hooks/useEscapeKey.js      → .ts
│
├── B-3: ユーティリティ・ライブラリ (8ファイル)
│   ├── lib/constants.js           → .ts
│   ├── lib/imageUtils.js          → .ts
│   ├── lib/auditLog.js            → .ts
│   ├── lib/formStyles.js          → .ts
│   ├── lib/themeClasses.js        → .ts
│   ├── utils/cn.js                → .ts
│   ├── utils/storage.js           → .ts
│   └── utils/municipalityLabel.js → .ts
│
├── B-4: レイアウトコンポーネント (4ファイル)
│   ├── components/layout/Header.jsx      → .tsx
│   ├── components/layout/Footer.jsx      → .tsx
│   ├── components/layout/BottomNav.jsx   → .tsx
│   └── components/layout/DrawerMenu.jsx  → .tsx
│
├── B-5: UIコンポーネント (7ファイル)
│   ├── components/ui/ErrorBoundary.jsx    → .tsx
│   ├── components/ui/LoadingScreen.jsx    → .tsx
│   ├── components/ui/Toast.jsx            → .tsx
│   ├── components/ui/InstallBanner.jsx    → .tsx
│   ├── components/ui/PhotoViewer.jsx      → .tsx
│   ├── components/ui/HowToSection.jsx     → .tsx
│   ├── components/ui/CrayfishIllustration.jsx → .tsx
│   ├── components/ui/StatCard.jsx         → .tsx
│   ├── components/ui/charts/DonutChart.jsx → .tsx
│   └── components/ui/charts/BarChart.jsx   → .tsx
```
