## 影響範囲

### 変更対象ファイル

| ファイル | 変更内容 |
|---|---|
| `supabase/functions/_shared/aiLogging.ts` | `AiErrorKind` に `gemini_truncated` / `gemini_safety` 追加、`GeminiResponseError` クラス新設、`classifyAiError` 拡張 |
| `supabase/functions/analyze-image/index.ts` | `analyzeWithGemini` の頑健化 (FR-127-04〜08)、IMAGE_SYSTEM_PROMPT の notes 短縮 |
| `supabase/functions/analyze-audio/index.ts` | 同等の頑健化 |
| `supabase/functions/_shared/__tests__/sharedModules.test.ts` | `classifyAiError` ケース追加 |
| `supabase/functions/analyze-image/index.test.ts` | MAX_TOKENS / SAFETY / 前置き JSON のテスト追加 |
| `src/types/post.ts` | `AIErrorKind` 拡張 |
| `src/components/features/admin/ReviewCardAI.tsx` | `gemini_truncated` / `gemini_safety` 分岐追加 |
| `src/components/features/admin/__tests__/ReviewCardAI.test.tsx` | UI テスト追加 |
| `.github/workflows/ci.yml` | `edge-functions-deploy-lag` ジョブ追加 |
| `docs/runbooks/edge-function-deploy.md` | 新規 |

### 他機能への影響

- **REQ-125 (error_kind 分類)**: 既存値はそのまま、type 拡張のみ。switch 文に case 追加で済む
- **REQ-126 (gemini_auth/transient + banner)**: バナーは `gemini_auth` のみ見ているので無影響。`useGeminiAuthBanner` の polling 条件は変更不要
- **REQ-079 (reanalysis rate limit)**: `gemini_safety` で disabled な投稿は再判定 API を叩かないので影響なし
- **コスト集計 (REQ-075)**: retry 1 回ぶんの token 増加を `ai_call_logs` で追跡可能（既存ロジックで自動カウントされる）
- **環境変数**: `GEMINI_MAX_OUTPUT_TOKENS` を新規追加。Supabase Edge Function Secrets と `.env.example` 両方に。デフォルトは 512

## 優先度

- **緊急度**: High（実際に運用障害が発生済み、再発確率高い）
- **重要度**: High（AI 自動承認の信頼性に直結）
- **理由**: 1 件失敗するたびに管理者の手動審査負荷が増える。MAX_TOKENS は確率的に発生するので「気付いたら全件 pending」状態になり得る。手動承認で迂回可能なため Critical ではないが、放置はできない。Phase 分け推奨:
  - **Phase 1 (P0 相当)**: FR-127-01〜08（型・分類・パース・retry）。これだけで運用障害の根本対策になる
  - **Phase 2 (P1)**: FR-127-09〜10（UI 出し分け）+ FR-127-12 (runbook)
  - **Phase 3 (P2)**: FR-127-11（CI deploy-lag 検知）— 中長期の運用安定化
