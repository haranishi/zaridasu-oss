## 機能要件

### FR-001: Post 型定義の整備
- **説明:** `src/types/` に Post 関連の型階層を整備し、全ファイルから `any` を排除する
- **対象ファイル:**
  - `src/types/index.ts` - 基本型の拡張
  - `src/views/admin/AdminPostsPage.tsx` - `Record<string, any>` × 7箇所
  - `src/views/DetailPage.tsx` - `Record<string, any> | null`
  - `src/views/HomePage.tsx` - reducer の `any`
  - `src/views/TrendsPage.tsx` - `(item: any)`
  - `src/views/RankingPage.tsx` - `(entry: any)`
  - `src/views/ProfilePage.tsx` - `(b: any)`
  - `src/hooks/useSurveyRequests.ts` - `relatedPosts: any[]`
  - `src/hooks/useCsvExport.ts` - `(p: any)`, `(r: any[])`
  - `src/components/ui/charts/DonutChart.tsx` - `[key: string]: any`
- **新規型定義:**
  ```typescript
  // src/types/post.ts
  export interface Post { id: string; species: Species; info_type: InfoType; ... }
  export interface PostWithAI extends Post { ai_result?: AIResult | null }
  export interface PostWithPhotos extends Post { photos: string[] }
  export interface AIResult {
    detected_species: string
    species_match: boolean | null
    confidence: number | null
    image_quality: string
    notes?: string
    per_photo?: AIPhotoResult[]
    analyzed_count?: number
    photo_count?: number
    error?: string
  }
  ```

### FR-002: 大規模ファイルの分割

#### FR-002a: AdminPostsPage.tsx（965行）→ 4ファイル
- **分割先:**
  - `AdminPostsPage.tsx` - ページ本体（状態管理・テーブル表示）
  - `components/features/admin/AIBadge.tsx` - AI判定バッジコンポーネント
  - `components/features/admin/PostReviewModal.tsx` - 投稿審査モーダル
  - `hooks/useAdminPostActions.ts` - 承認・却下・一括操作ロジック

#### FR-002b: PostForm.tsx（733行）→ 3ファイル
- **分割先:**
  - `PostForm.tsx` - フォーム本体（UI表示）
  - `hooks/usePostFormState.ts` - フォーム状態管理・バリデーション・下書き復元
  - `hooks/useFocusTrap.ts` - フォーカストラップ（共通化、FR-003と連動）

#### FR-002c: DetailPage.tsx（489行）→ 2ファイル
- **分割先:**
  - `DetailPage.tsx` - ページ本体
  - `components/features/posts/AIResultCard.tsx` - AI判定結果カード

#### FR-002d: MapView.tsx（464行）→ 2ファイル
- **分割先:**
  - `MapView.tsx` - 地図本体
  - `lib/mapIcons.ts` - マーカーアイコン生成ユーティリティ

#### FR-002e: AuthModal.tsx（423行）→ 3ファイル
- **分割先:**
  - `AuthModal.tsx` - モーダルコンテナ（タブ切替）
  - `components/modals/LoginForm.tsx` - ログインフォーム
  - `components/modals/SignupForm.tsx` - サインアップフォーム

