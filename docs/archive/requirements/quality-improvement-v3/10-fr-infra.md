### FR-035: 環境変数ビルド時検証
- **説明:** next.config.ts で必須環境変数の存在を検証し、不足時にビルドを中断する
- **入力:** ビルドプロセス開始
- **処理:**
  1. `next.config.ts` の先頭で必須変数を検証:
     ```
     NEXT_PUBLIC_SUPABASE_URL
     NEXT_PUBLIC_SUPABASE_ANON_KEY
     ```
  2. 不足時は `throw new Error('Missing required env: ...')` でビルド中断
  3. 開発環境では警告のみ（`process.env.NODE_ENV === 'production'` で分岐）
- **出力:** 環境変数不足時のビルド失敗
- **関連:** US-008/AC-1

### FR-036: Sentry 統合
- **説明:** Sentry をクライアント・サーバー両方に統合しエラーを自動収集する
- **入力:** ランタイムエラー
- **処理:**
  1. `@sentry/nextjs` パッケージを追加
  2. `sentry.client.config.ts` / `sentry.server.config.ts` を作成
  3. `instrumentation.ts` で Sentry を初期化
  4. `logError()` ユーティリティに Sentry 送信を追加
  5. `error.tsx` で `Sentry.captureException(error)` を呼び出し
  6. パフォーマンストレーシング（サンプルレート 0.1）を有効化
- **出力:** Sentry ダッシュボードでのエラー監視
- **関連:** US-008/AC-2

### FR-037: 外部キー CASCADE 修正
- **説明:** 外部キー制約に適切な ON DELETE 動作を設定し、孤立レコードを防止する
- **入力:** ユーザー削除イベント
- **処理:**
  1. `comments.user_id` → `ON DELETE CASCADE`（ユーザー削除時にコメントも削除）
  2. `likes.user_id` → `ON DELETE CASCADE`（ユーザー削除時にいいねも削除）
  3. `reports.user_id` → `ON DELETE SET NULL`（レポート履歴は保持）
  4. `survey_requests.user_id` → `ON DELETE CASCADE`（ユーザー削除時に依頼も削除）
  5. `posts.user_id` → 既存の `ON DELETE SET NULL` を維持（投稿は匿名化して保持）
- **出力:** 一貫した外部キー CASCADE 動作
- **関連:** US-008/AC-3

---

