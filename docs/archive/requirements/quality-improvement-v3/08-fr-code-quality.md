### FR-022: relatedPosts 型修正
- **説明:** useSurveyRequests の relatedPosts を `any[]` から `Post[]` に変更する
- **入力:** useSurveyRequests.ts
- **処理:**
  1. `import type { Post } from '../types'`
  2. `relatedPosts: any[]` → `relatedPosts: Post[]` に変更
  3. Supabase クエリの select を Post 型に合わせて調整
- **出力:** 型安全な relatedPosts
- **関連:** US-005/AC-1

### FR-023: ESLint 無効化コメント追記
- **説明:** コードベース内のすべての ESLint 無効化ディレクティブに理由コメントを追記する
- **入力:** ESLint 無効化ディレクティブ
- **処理:**
  1. `grep -r "eslint-disable"` で全箇所を検出
  2. 各ディレクティブの直前行に `// Reason: ...` コメントを追加
  3. 不要なディレクティブは削除
- **出力:** ドキュメント化された ESLint ディレクティブ
- **関連:** US-005/AC-2

### FR-024: 管理画面エラーバウンダリ
- **説明:** `/admin` 配下に専用の `error.tsx` を作成し、管理画面のクラッシュを隔離する
- **入力:** 管理画面コンポーネントのランタイムエラー
- **処理:**
  1. `src/app/admin/error.tsx` を作成
  2. 管理画面用のエラーUI（管理者向けデバッグ情報表示）
  3. リトライボタン + ダッシュボードへの遷移リンク
  4. エラーを `logError()` で記録
- **出力:** 管理画面限定のエラー画面
- **関連:** US-005/AC-3

### FR-025: スケルトンコンポーネント
- **説明:** 主要コンポーネント用のスケルトンローディング UI を作成する
- **入力:** 各コンポーネントのレイアウト構造
- **処理:**
  1. `PostCardSkeleton`: 写真エリア + テキスト行のパルスアニメーション
  2. `MapSkeleton`: 地図枠 + コントロールプレースホルダー
  3. `StatCardSkeleton`: 数値エリア + ラベルのプレースホルダー
  4. ダークモード対応（bg-slate-800 / bg-gray-200）
- **出力:** レイアウトシフトのないローディング UI
- **関連:** US-005/AC-4

### FR-026: Zod バリデーション導入
- **説明:** Supabase クエリ結果の型アサーション（`as`）を Zod スキーマバリデーションに置換する
- **入力:** Supabase クエリ結果
- **処理:**
  1. `zod` パッケージを追加
  2. 主要テーブル（posts, user_profiles, stats）の Zod スキーマを定義
  3. クエリ結果を `schema.parse(data)` でバリデーション
  4. パース失敗時はデフォルト値にフォールバックし、エラーをログ
- **出力:** ランタイムバリデーション済みデータ
- **エラーハンドリング:** ZodError 時はフォールバック値を返しつつ logError で記録
- **関連:** US-005/AC-5

### FR-027: エラーハンドリング統一
- **説明:** 全 hooks のエラーハンドリングを `logError()` ユーティリティに統一する
- **入力:** 各 hook の catch ブロック
- **処理:**
  1. `console.error` → `logError(err, 'hookName:functionName')` に置換
  2. サイレント失敗箇所を検出し、logError を追加
  3. AbortError は無視パターンを統一
- **出力:** 統一されたエラーログ
- **関連:** US-005/AC-6

