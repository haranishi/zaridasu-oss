## 0. コード側ガードレール（すでに実装済み・確認用）

ダッシュボード設定の前に、コード側に何があるかを把握しておく（事故時に「何が効くか」が分かる）。

| 仕組み | 何をするか | 場所 / env |
|---|---|---|
| **AI kill switch** | `AI_ANALYSIS_ENABLED=false` で Gemini 呼び出しを即停止（投稿は保存 → 手動レビュー） | `supabase/functions/_shared/aiKillSwitch.ts` / env `AI_ANALYSIS_ENABLED`（REQ-218） |
| **リトライ暴走の抑止** | MAX_TOKENS 限定リトライに指数バックオフ + ジッタ + 全体タイムアウト + 回数上限（env 化） | `supabase/functions/_shared/aiRetryConfig.ts` / env `AI_MAX_RETRY` / `AI_REQUEST_TOTAL_TIMEOUT_MS` ほか（REQ-218） |
| **冪等性ガード** | `ai_analyzed_at` / `audio_analysis.analyzed_at` で二重配信時の二重課金を防ぐ。失敗は `ai_failure_count` 加算で打ち切り（無限再投入なし） | `analyze-image/index.ts` / `analyze-audio/index.ts`（REQ-050/218） |
| **送信前サイズ上限** | Gemini へ送る前に画像/音声のバイト上限で弾く（コスト/メモリ暴走防止） | env `AI_MAX_IMAGE_BYTES` / `AI_MAX_AUDIO_BYTES`（主管 REQ-215・本書から参照） |
| **再分析レート制限** | 再分析を post_id 単位の日次上限で絞る（取得失敗時 fail-closed） | env `AI_REANALYSIS_DAILY_LIMIT`（REQ-079） |
| **入口 bot / レート制限** | 公開エンドポイントの頻度制限・CAPTCHA | REQ-212（本書では前提・参照のみ） |
| **鍵失効検知** | `ai_call_logs.error_kind='gemini_auth'` の急増をメール通知 | `notify-gemini-key-failure` / env `GEMINI_AUTH_FAILURE_THRESHOLD` 等（REQ-126） |
| **コスト事後集計** | Gemini コストの月次レポート / 可視化（週次確認の入力に使う） | `scripts/calc-ai-cost.ts`（`npm run cost:ai`）/ `/admin/ai-cost`（REQ-075） |

> これらは「使う前 / 最中に止める」「使った後に集計する」を補い合う。**自動停止する billing は採用しない**（破壊的・復旧不能リスク。後述 §3 段階 6）。

---
