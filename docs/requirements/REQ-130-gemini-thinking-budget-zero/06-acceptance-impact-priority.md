## 受入条件

- [ ] **AC-130-01**: **Given** 9 秒の音声付き投稿、**When** `analyze-audio` が起動、**Then** `body.generationConfig.thinkingConfig.thinkingBudget === 0` で Gemini を呼ぶ。
- [ ] **AC-130-02**: **Given** thinkingBudget=0 で呼ぶ Gemini 2.5 Flash、**When** 正常応答、**Then** `output_tokens < 200` 程度 (過去成功 72〜87 の範囲内) で完結し、MAX_TOKENS を踏まない。
- [ ] **AC-130-03**: **Given** retry が 2 回まで拡張、**When** 2 回目 retry で成功、**Then** posts.ai_result が正常に書かれる。
- [ ] **AC-130-04**: **Given** 3 回とも MAX_TOKENS、**When** 最終 catch、**Then** `ai_result.error_kind='gemini_truncated'`、`ai_call_logs.error_kind='gemini_truncated'`、`input_tokens`/`output_tokens` が NULL でなく実値が入っている。
- [ ] **AC-130-05**: **Given** env `GEMINI_THINKING_BUDGET=128`、**When** analyze-audio 起動、**Then** リクエストに `thinkingBudget: 128` が渡される。
- [ ] **AC-130-06**: **Given** responseSchema を指定した analyze-image、**When** Gemini 応答、**Then** 受け取った JSON が schema に従っており、`JSON.parse` 失敗で `error_kind='json_parse'` になるケースが激減する。
- [ ] **AC-130-07**: **Given** 本番デプロイ後、**When** ユーザーが新規音声投稿を作成、**Then** AI 判定が成功し `auto_approved` または `auto_rejected` が動く (manual review 以外のステータスに遷移する)。

## 影響範囲

### 変更対象ファイル

| ファイル | 変更内容 |
|---|---|
| `supabase/functions/_shared/aiLogging.ts` | `GeminiResponseError.usage` 追加、`getThinkingBudget()` ヘルパ追加 |
| `supabase/functions/analyze-audio/index.ts` | generationConfig に thinkingConfig + responseSchema、`AUDIO_RESPONSE_SCHEMA` 定義、retry を 2 回に拡張、catch で usage 保持 |
| `supabase/functions/analyze-image/index.ts` | 同上 (`IMAGE_RESPONSE_SCHEMA`) |
| `supabase/functions/health-gemini/index.ts` | generationConfig に thinkingConfig 追加 (false negative 防止) |
| `supabase/functions/_shared/__tests__/sharedModules.test.ts` | 配線テスト追加 (FR-130-11) |
| `supabase/functions/analyze-image/index.test.ts` | retry 2 回 + usage 保持テスト追加 (FR-130-12, 13) |
| `.env.example` | `GEMINI_THINKING_BUDGET=0` コメント追加 |
| `docs/runbooks/ai-model-rollback.md` | モデル選定経緯と thinkingBudget 解説 |

### 他機能への影響

- **REQ-127 (MAX_TOKENS retry)**: retry 回数を 1 → 2 に拡張。既存テストで `mockSequentialGeminiFlow` を 2 回 retry に対応させる必要あり
- **REQ-125/126 (error_kind / banner)**: `gemini_truncated` の発生頻度が劇的に減る (= バナー静かになる) はず
- **REQ-076 (gemini-2.5-flash-lite)**: 当初の意図 (Lite で thinking 回避) が secret 上書きで失われていた事実をドキュメント化
- **コスト**: output token 大幅減で月コスト ~1/10 に
- **本番デプロイ手順**:
  1. 該当 Edge Function を再デプロイ (3 関数)
  2. `.env.example` 反映 (optional、env を変えるなら secret 更新も)
  3. 既存の `error_kind='gemini_truncated'` 投稿は再判定ボタンで自動復旧

## 優先度

- **緊急度**: **Critical**（実運用で `analyze-audio` 全件失敗中、`analyze-image` も時間の問題）
- **重要度**: **High**（AI 自動承認/却下機能の基盤）
- **理由**: 7 日間連続で analyze-audio 成功 0 件という事実。修正は 1〜2 行 (`thinkingBudget: 0`) で本質的に解決するため、コスト対効果が極めて高い。Phase 分けは不要、**Phase 1 で全部実装**する想定:
  - Phase 1: FR-130-01〜09 + 11〜13（コード変更 + テスト） — 1 PR で完結
  - Phase 1 後段: FR-130-10（ドキュメント） — 同 PR 内で OK
