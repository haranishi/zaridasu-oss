### FR-020: PWAマニフェスト完備
- **説明:** マニフェストに不足項目を追加
- **対象ファイル:** `src/app/manifest.ts`
- **処理:**
  - scope: '/'
  - categories: ['education', 'utilities']
  - screenshots: 少なくとも1枚（640x1136）
  - shortcuts: [{ name: '投稿する', url: '/?action=post', icon: '...' }]
  - PNG アイコン追加: 192x192, 512x512（SVGと並列）

### FR-021: iOS PWA メタタグ
- **説明:** iOS Safari 用の PWA メタタグを追加
- **対象ファイル:** `src/app/layout.tsx`
- **処理:**
  ```html
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="ザリダス" />
  <link rel="apple-touch-icon" href="/icon-192.png" />
  ```

### FR-022: TypeScript strict モード有効化
- **説明:** tsconfig.json で strict: true に変更し、型エラーを解消
- **対象ファイル:** `tsconfig.json`, any を含む20+ファイル
- **処理:**
  - `"strict": true` に変更
  - 全 `any` 型を適切な型に置換
  - `as any` アサーションを型ガードまたは適切な型定義に置換
  - Window API 拡張は `declare global` で型定義

### FR-023: コンポーネント props 型定義
- **説明:** 5コンポーネントの untyped props に TypeScript interface を追加
- **対象ファイル:** `AuthModal.tsx`, `EditDialog.tsx`, `DeleteDialog.tsx`, `PostCard.tsx`, `LocationPicker.tsx`
- **処理:**
  ```typescript
  interface EditDialogProps {
    post: Post
    onSave: (data: EditPostData) => Promise<void>
    onCancel: () => void
    saving: boolean
    dark: boolean
    error: string | null
  }
  export default function EditDialog({ post, onSave, onCancel, saving, dark, error }: EditDialogProps)
  ```

### FR-024: グローバルエラーバウンダリ
- **説明:** Next.js App Router のグローバル error.tsx を作成
- **対象ファイル:** 新規 `src/app/error.tsx`
- **処理:**
  ```typescript
  'use client'
  export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
    // エラー表示 + 再試行ボタン + ホームへのリンク
    // logError() でエラーログ送信
  }
  ```

### FR-025: 翻訳キー補完
- **説明:** EN/ZH/KO に不足している5キーを追加
- **対象ファイル:** `src/locales/en/translation.json`, `src/locales/zh/translation.json`, `src/locales/ko/translation.json`
- **追加キー:**
  - `infoType.absence`
  - `postForm.geoPermissionDenied`
  - `postForm.geoTimeout`
  - `postForm.geoUnavailable`
  - `weather.fetchError`

### FR-026: useAdminStats エラーハンドリング
- **説明:** Promise.all の個別クエリエラーをキャッチし UI に表示
- **対象ファイル:** `src/hooks/useAdminStats.ts`
- **処理:**
  - try/catch で Promise.all を包む
  - `error` state を追加
  - キャッチ時に `logError()` + `setError()` で UI 表示
  - 管理画面にエラーバナー表示

### FR-027: useLike 競合状態修正
- **説明:** 連続クリック時の重複いいねを防止
- **対象ファイル:** `src/hooks/useLike.ts`
- **処理:**
  - `toggling` フラグ（useRef）で二重実行防止
  - toggleLike 開始時に true、完了/エラー時に false
  - toggling 中は早期 return
