## 機能要件

### FR-076-01: analyze-audio のモデル切替
- **説明:** 評価基盤での A/B 結果に基づき、`gemini-2.5-flash` から **より安価なモデル**（候補: `gemini-2.5-flash-lite`、`gemini-3.1-flash-lite-preview` の音声対応版があれば 等）へ切替
- **入力:** 環境変数 `GEMINI_AUDIO_MODEL`（既存）
- **処理:** 既存 `analyze-audio/index.ts:35` の env 取得ロジックをそのまま活用、デフォルト値のみ変更
- **出力:** 既存と同型の `audio_analysis` JSONB
- **バリデーション:** 候補モデルが Gemini 音声入力に対応していること（要確認）
- **エラーハンドリング:** モデルが利用不可の場合のエラーレスポンスを既存 try-catch で吸収

### FR-076-02: analyze-image のモデル設定の環境変数化
- **説明:** `analyze-image/index.ts:29` のハードコード `gemini-3.1-flash-lite-preview` を env 化
- **追加環境変数:** `GEMINI_IMAGE_MODEL`（デフォルト値は GA 版モデル）
- **コード変更:**
  ```ts
  // Before
  const GEMINI_MODEL = 'gemini-3.1-flash-lite-preview'

  // After
  const GEMINI_MODEL = Deno.env.get('GEMINI_IMAGE_MODEL') ?? 'gemini-2.5-flash-lite'
  ```
- **バリデーション:** 起動時に `GEMINI_IMAGE_MODEL` が空でないこと
- **エラーハンドリング:** 既存 try-catch で吸収

### FR-076-03: 閾値の再キャリブレーション
- **説明:** モデル切替後、評価データセット上の confidence 分布を見て自動承認/リジェクト閾値を見直す
- **対象定数:**
  - `AUTO_APPROVE_BOTH = 0.75`
  - `AUTO_APPROVE_AUDIO_ONLY = 0.85`
  - `AUTO_REJECT_CONFIDENCE = 0.70`
- **処理:** Phase 0 の閾値スイープレポートを参照し、新モデルでの最適閾値を提案
- **更新方法:** Edge Function コード内定数 → **環境変数化を推奨**（`AI_AUTO_APPROVE_BOTH` 等）。実装可否は判断による
- **出力:** 閾値変更前後の自動承認率・誤承認率の比較レポート

### FR-076-04: A/B 評価レポート
- **説明:** Phase 0 のスクリプトを使い、現行モデル vs 候補モデルを横並び比較
- **比較項目:**
  - precision / recall / F1（class-wise）
  - 平均 confidence
  - 平均レイテンシ
  - 推定コスト（per call）
  - 自動承認/リジェクトの判断分布
- **保存先:** `reports/phase1-ab/<date>.md`

### FR-076-05: ロールバック手順のドキュメント化
- **説明:** 切替後に問題が出た場合の rollback を環境変数変更のみで完結させる
- **手順例:**
  1. Supabase Dashboard → Edge Functions → Secrets で `GEMINI_AUDIO_MODEL=gemini-2.5-flash` に戻す
  2. 反映確認（1〜2 分）
  3. ロールバック理由を `docs/runbooks/ai-model-rollback.md` に追記
- **保存先:** `docs/runbooks/ai-model-rollback.md`（新規）

---
