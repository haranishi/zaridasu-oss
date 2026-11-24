### FR-006: RPC キャンセル対応
- **説明:** `supabase.rpc()` が AbortSignal をサポートしないため、Promise.race でタイムアウトを実装する
- **入力:** RPC 呼び出し + AbortSignal
- **処理:**
  1. `rpcWithTimeout(rpcPromise, signal, timeoutMs = 10000)` ユーティリティを作成
  2. `Promise.race([rpcPromise, timeoutPromise, abortPromise])` でレース
  3. タイムアウト/アボート時は結果を破棄し、setState を実行しない
- **出力:** RPC レスポンスまたはタイムアウト/キャンセル
- **エラーハンドリング:** タイムアウト時は `{ data: null, error: 'timeout' }` を返す
- **関連:** US-002/AC-1

### FR-007: SessionStorage キャッシュクリーンアップ
- **説明:** TTL 期限切れのキャッシュエントリを定期的に削除する
- **入力:** sessionStorage 内のキャッシュキー
- **処理:**
  1. `getCached()` 内で TTL 切れのエントリを即座に `removeItem()` で削除
  2. アプリ起動時に全キャッシュキーを走査し、期限切れを一括削除
- **出力:** クリーンな sessionStorage
- **関連:** US-002/AC-2

### FR-008: ImageProcessor キュー制限
- **説明:** Worker の _pending Map に上限を設け、超過時は最古のリクエストを拒否する
- **入力:** 画像処理リクエスト
- **処理:**
  1. `_pending.size >= MAX_PENDING (10)` の場合、最古エントリの Promise を reject
  2. 新規リクエストを追加
- **出力:** 制限内での画像処理結果
- **エラーハンドリング:** 拒否されたリクエストはメインスレッドフォールバックで再処理
- **関連:** US-002/AC-3

### FR-009: Leaflet アイコン LRU キャッシュ
- **説明:** speciesIconCache / surveyIconCache を LRU キャッシュ（上限 20 件）に変更する
- **入力:** アイコン生成リクエスト
- **処理:**
  1. 簡易 LRU Map クラスを作成（`Map` 拡張、get 時に末尾移動、set 時に先頭削除）
  2. 上限 20 件で最古エントリを自動削除
- **出力:** キャッシュされた L.DivIcon
- **関連:** US-002/AC-4

### FR-010: MapView スケルトン UI
- **説明:** MapViewWrapper の loading コンポーネントをスケルトン UI に置換する
- **入力:** MapView dynamic import の loading 状態
- **処理:**
  1. 地図エリアの骨格を模したスケルトン（灰色背景 + パルスアニメーション）
  2. コントロールボタン・ズームボタンのプレースホルダー
  3. ダークモード対応
- **出力:** レイアウトシフトのないスケルトン表示
- **関連:** US-002/AC-5

### FR-011: アップロードロールバックタイムアウト
- **説明:** 写真アップロード失敗時のロールバック処理に 10 秒タイムアウトを設ける
- **入力:** アップロード失敗イベント
- **処理:**
  1. `Promise.race([rollbackPromise, timeoutPromise(10000)])` でラップ
  2. タイムアウト時はロールバック失敗をログに記録し、ユーザーにエラー通知
- **出力:** タイムアウト付きロールバック結果
- **関連:** US-002/AC-6

