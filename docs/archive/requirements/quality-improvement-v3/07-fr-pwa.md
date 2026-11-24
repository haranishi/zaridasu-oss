### FR-018: SW キャッシュバージョニング
- **説明:** Service Worker のキャッシュ名にビルドハッシュを含め、デプロイ時に旧キャッシュを自動削除する
- **入力:** ビルド時のハッシュ（`Date.now()` またはビルドID）
- **処理:**
  1. `sw.js` をテンプレートから生成し、`CACHE_NAME` にビルドハッシュを埋め込む
  2. activate イベントで旧バージョンのキャッシュを削除
  3. Next.js の `next.config.ts` の `generateBuildId` でビルドID を固定化し、sw.js に注入
- **出力:** バージョン付きキャッシュ管理
- **関連:** US-004/AC-1

### FR-019: PWA マニフェスト拡充
- **説明:** manifest.ts に screenshots・categories・related_applications を追加する
- **入力:** manifest.ts 定義
- **処理:**
  1. `screenshots`: モバイル/デスクトップのアプリスクリーンショット（2-3枚）
  2. `categories`: `["environment", "education", "science"]`
  3. `related_applications`: `[]`（ネイティブアプリなし）
  4. `prefer_related_applications`: `false`
- **出力:** 拡充された PWA マニフェスト
- **関連:** US-004/AC-2

### FR-020: SW エラー種別判定
- **説明:** Service Worker が API レスポンスのステータスコードに基づいて適切に処理を分岐する
- **入力:** fetch イベントのレスポンス
- **処理:**
  1. ナビゲーションリクエスト: ネットワークエラー→ `/offline`、4xx/5xx → そのまま返す
  2. API リクエスト（Supabase URL）: ネットワークエラー → キャッシュフォールバック or エラーJSONレスポンス
  3. 静的アセット: キャッシュファースト（変更なし）
- **出力:** エラー種別に応じた適切なレスポンス
- **関連:** US-004/AC-3

### FR-021: Background Sync 実装
- **説明:** Background Sync API でオフライン投稿を接続復帰時に自動送信する
- **入力:** オフライン投稿保存イベント
- **処理:**
  1. `navigator.serviceWorker.ready.then(reg => reg.sync.register('sync-offline-posts'))`
  2. SW の `sync` イベントハンドラで IndexedDB から未送信投稿を取得・送信
  3. 送信成功時に IndexedDB からエントリを削除
  4. 送信失敗時は再試行（ブラウザが自動リトライ）
  5. Background Sync 未対応ブラウザでは従来の手動送信にフォールバック
- **出力:** 自動的に送信された投稿
- **エラーハンドリング:** 送信失敗時はエラーステータスを更新し次回リトライ
- **関連:** US-004/AC-4

