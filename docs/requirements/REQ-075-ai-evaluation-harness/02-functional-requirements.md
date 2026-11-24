## 機能要件

### FR-075-01: ラベル付き評価データセット（音声）
- **説明:** ウシガエル / 在来種カエル / ノイズ / 不明 の 4 クラスを想定
- **数量:** **最低 100 件**、各クラス 25 件以上が望ましい
- **配置:** `tests/fixtures/audio/<class>/*.{webm,mp3,ogg}`
- **メタデータ:** `tests/fixtures/audio/labels.json` にファイル名・正解クラス・録音条件・出典
- **バリデーション:** 各ファイル 1MB 以下、10 秒以下（本番制約と同じ）

### FR-075-02: ラベル付き評価データセット（画像）
- **説明:** ウシガエル / アメリカザリガニ / 在来種類似 / その他 の 4 クラス
- **数量:** **最低 100 件**、各クラス 25 件以上が望ましい
- **配置:** `tests/fixtures/images/<class>/*.{jpg,png,webp}`
- **メタデータ:** `tests/fixtures/images/labels.json`

### FR-075-03: 評価実行スクリプト
- **説明:** 指定されたモデル設定で Edge Function ロジック（`analyzeWithGemini`）を loop 実行
- **入力:**
  - `--target=audio|image` 必須
  - `--model=<gemini-model-id>` オプション（デフォルト: 環境変数 / 現在のハードコード）
  - `--limit=<int>` オプション（テスト用に件数制限）
  - `--temperature=<float>` オプション（デフォルト: 0）
  - `--with-cache=true|false`（Phase 3 評価用）
- **処理:**
  1. `tests/fixtures/<target>/labels.json` を読む
  2. 各サンプルに対して `analyzeWithGemini` を呼ぶ（Edge Function を import するか、ロジックを切り出して share する）
  3. 結果を集計し confusion matrix / precision / recall / F1 を計算
  4. 推定 API コストも同時に算出（入出力トークン数 × 単価）
- **出力:**
  - 標準出力: 人間可読サマリー
  - JSON: `reports/eval/eval-<timestamp>-<target>-<model>.json`
- **エラーハンドリング:** 個別サンプルの失敗は warning ログに残し処理継続。集計結果に `errors_count` を含める

### FR-075-04: コスト集計スクリプト
- **説明:** Gemini 呼び出しログから期間別コストを集計
- **入力:**
  - `--period=<duration>`（例: `30d`, `7d`, `90d`）
  - `--group-by=function|model|day` オプション
- **処理:** `audit_logs` または新設する `ai_call_logs` テーブルから集計
- **出力:** 標準出力（表形式）+ JSON

### FR-075-05: AI 呼び出しログテーブル（必要に応じて新設）
- **説明:** Edge Function が呼び出されるたびにログを記録
- **記録項目:** post_id, function_name, model, input_tokens, output_tokens, latency_ms, status, created_at
- **代替案:** `audit_logs` の `metadata` JSONB に格納（既存テーブル活用、新設不要）。**どちらを採用するかは TBD**

### FR-075-06: 管理画面 AI コストダッシュボード
- **説明:** `/admin/ai-cost` ページ追加
- **表示内容:**
  - 直近 30 日の日次呼び出し回数（折れ線グラフ）
  - 直近 30 日の日次推定コスト（折れ線グラフ）
  - 累計推定コスト（今月 / 前月）
  - モデル別内訳（円グラフ or 表）
- **アクセス制御:** 既存 `/admin/*` の middleware による admin 認証

---
