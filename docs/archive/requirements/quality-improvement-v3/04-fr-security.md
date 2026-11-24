## Step 3: 機能要件

### FR-001: CSP nonce ベース移行
- **説明:** CSP ヘッダーから `unsafe-inline`/`unsafe-eval` を除去し、Next.js の nonce 機構を利用してインラインスクリプトを許可する
- **入力:** Next.js ビルド時の nonce 生成
- **処理:**
  1. `next.config.ts` の CSP から `unsafe-inline` と `unsafe-eval` を削除
  2. Next.js の `nonce` プロパティを middleware で生成し、`Content-Security-Policy` ヘッダーに `'nonce-{value}'` を追加
  3. Google Analytics タグに nonce 属性を付与
  4. styled-jsx / Tailwind CSS のインラインスタイルは `style-src 'self' 'unsafe-inline'` で許可（CSS のみ）
- **出力:** XSS 耐性が向上した CSP ヘッダー
- **バリデーション:** nonce は各リクエストごとに一意の暗号学的ランダム値
- **エラーハンドリング:** nonce 生成失敗時はフォールバック CSP（strict-dynamic）を使用
- **関連:** US-001/AC-1

### FR-002: posts テーブル CHECK 制約追加
- **説明:** `is_anonymous = false` の投稿には `user_id` が必須であることをDBレベルで強制する
- **入力:** posts テーブルへの INSERT/UPDATE
- **処理:** `ALTER TABLE posts ADD CONSTRAINT chk_user_id_required CHECK (is_anonymous = true OR user_id IS NOT NULL)`
- **出力:** 制約違反時に PostgreSQL エラー
- **バリデーション:** 既存データが制約に適合することを事前確認
- **エラーハンドリング:** 制約違反時はクライアントに 400 Bad Request 相当のエラーを返す
- **関連:** US-001/AC-2

### FR-003: ミドルウェアエラーハンドリング
- **説明:** `updateSession()` の Supabase クライアント作成をtry-catch で囲み、失敗時にグレースフルに処理する
- **入力:** Next.js リクエスト
- **処理:**
  1. try-catch で `createServerClient()` を囲む
  2. 失敗時は認証なしレスポンス（未認証ルートは通過、認証必須ルートはリダイレクト）
  3. エラーを `logError()` で記録
- **出力:** 500 エラーの代わりに適切なフォールバック動作
- **関連:** US-001/AC-3

### FR-004: RPC スロットリング
- **説明:** クライアント側で RPC 呼び出しの頻度を制限する汎用ユーティリティを作成する
- **入力:** RPC 呼び出しリクエスト
- **処理:**
  1. `throttleRpc(key: string, minIntervalMs: number)` ユーティリティを作成
  2. 同一キーの呼び出しを minIntervalMs（デフォルト 1000ms）以内に制限
  3. 制限中のリクエストはスキップし前回の結果を返す
- **出力:** スロットリングされた RPC レスポンス
- **バリデーション:** key ごとに独立したタイムスタンプ管理
- **エラーハンドリング:** タイマーエラー時は制限なしでフォールバック
- **関連:** US-001/AC-4

### FR-005: 編集投稿バリデーション共通化
- **説明:** usePostForm と useEditPost で共有するバリデーションユーティリティを作成する
- **入力:** 投稿フォームデータ（species, info_type, comment, count, lat, lng, municipality）
- **処理:**
  1. `src/lib/postValidation.ts` を作成
  2. バリデーションルール:
     - `comment`: 0-500 文字
     - `count`: 1-9999 の整数
     - `lat`: 38.8-40.5（秋田県範囲）
     - `lng`: 139.5-140.8（秋田県範囲）
     - `species`: `american` | `bullfrog`
     - `info_type`: `sighting` | `capture` | `trace` | `damage` | `absence`
  3. `validatePostData(data): { valid: boolean; errors: Record<string, string> }` を export
  4. usePostForm と useEditPost の両方からインポートして使用
- **出力:** バリデーション結果オブジェクト
- **関連:** US-001/AC-5, US-006/AC-2

