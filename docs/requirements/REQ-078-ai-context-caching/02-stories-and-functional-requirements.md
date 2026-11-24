## ユーザーストーリー

### US-078-01: 開発者として固定プロンプトの再送を避けたい
**As a** 開発者,
**I want to** Edge Function の固定プロンプトと参照素材を Gemini にキャッシュさせたい,
**So that** 入力トークンの大半が割引対象となり API コストが大幅に下がる.

**受け入れ条件:**
- [ ] AC-1: `analyze-audio` のリクエストで cached content を参照する形に変更
- [ ] AC-2: `analyze-image` のリクエストで cached content を参照する形に変更
- [ ] AC-3: Cache miss / cache 失効時にも判定処理は正常完了する（フェイルオープン）
- [ ] AC-4: キャッシュ更新は自動（TTL 切れ前に再作成）

**優先度:** 中
**見積もり:** M

---

## 機能要件

### FR-078-01: Cached Content の作成
- **説明:** Edge Function 起動時 or 別途バッチで、Gemini Context Caching API に固定プロンプトを登録
- **入力:** プロンプト文字列、TTL（環境変数）
- **処理:**
  1. `POST https://generativelanguage.googleapis.com/v1beta/cachedContents` で登録
  2. レスポンスの `name`（cache ID）を取得
  3. cache ID を別途保管（DB テーブル or Edge Function の KV ストレージ）
- **出力:** cache ID
- **エラーハンドリング:** 失敗時は警告ログのみ。後続処理は cache 無しで実行

### FR-078-02: Cache ID の保管
- **説明:** 作成した cache ID を再利用するため永続化
- **保管先候補:**
  - **案 A:** Supabase 新設テーブル `ai_cache_registry`（function_name, model, cache_id, expires_at, created_at）
  - **案 B:** Supabase Vault（既存運用と整合）
  - **案 C:** Edge Function の global 変数（cold start で消える → 不適）
- **選定:** **案 A を推奨**。TTL 管理と監査が容易

### FR-078-03: Cached Content を使った推論呼び出し
- **説明:** `analyze-audio/index.ts` `analyze-image/index.ts` の Gemini API 呼び出し時に cache ID を付与
- **処理:**
  1. `ai_cache_registry` から有効な cache ID を取得（`expires_at > now() + safety_margin`）
  2. リクエスト body に `cachedContent: <cache_id>` を含める
  3. cache ID 取得失敗時は通常リクエスト（cache 無し）にフォールバック
- **入力:** リクエスト本体 + cache ID
- **出力:** 既存と同型の `audio_analysis` / 画像判定 JSONB

### FR-078-04: TTL 管理と自動 refresh
- **説明:** TTL 切れ前に cache を再作成
- **処理:**
  1. Edge Function 呼び出し時に `ai_cache_registry.expires_at` をチェック
  2. 残り < `GEMINI_CACHE_REFRESH_MARGIN_SECONDS`（例: 300 秒）なら **非同期で**再作成（呼び出し本体はブロックしない）
  3. 再作成完了後にレジストリ更新
- **代替案:** Supabase Cron Job で定期再作成。環境変数で TTL 制御
- **選定:** **当面は Edge Function 内のチェック方式で十分**（cron 不要）

### FR-078-05: Cache 統計のロギング
- **説明:** cache hit / miss / refresh をログに記録
- **記録項目:** function, model, cache_id, status (hit/miss/refresh/error), latency, created_at
- **保存先:** REQ-075 の `audit_logs.metadata.ai_call` に拡張（`cache_status` フィールド追加）
- **用途:** Phase 3 の効果測定（cache hit 率 ≥ 90% を目標）

---
