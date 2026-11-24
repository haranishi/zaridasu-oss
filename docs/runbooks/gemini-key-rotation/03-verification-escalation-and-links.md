## 検証

- [ ] `health-gemini` UI ボタン（Phase 2 導入後）で `ok: true` が返る
- [ ] 直後 1 時間以内に新規投稿が `ai_analyzed_at` を持ち、`ai_result.error` が無いことを確認
- [ ] 失敗履歴のある投稿について手動で再判定を実行し、`ai_result.error` が消えることを確認
- [ ] `ai_call_logs` に新たな `error_kind='gemini_auth'` が記録されないこと

## エスカレーション

新キーで `ok: true` が返らない場合は以下を順に確認する。

1. **モデル名**: Edge Function の `GEMINI_IMAGE_MODEL` / `GEMINI_AUDIO_MODEL` が、新キーで有効化されているモデル名と一致しているか
2. **API 有効化**: GCP コンソールで **Generative Language API** が有効化されているか
3. **Billing**: 該当 GCP プロジェクトの請求アカウントが有効か（無効化されているとキー自体は通っても API が 403 を返す）
4. **クォータ**: 上限超過していないか（その場合は `gemini_transient` 系の 429 になっているはず）
5. **キー制約**: AI Studio で当該キーに HTTP referrer / IP 制限を入れていないか（Edge Function からの呼び出しは Supabase の egress IP）

それでも解決しない場合は REQ-126 課題に追記して issue 化する。

## 関連

- 要件定義: [REQ-126](../requirements/REQ-126-gemini-key-failure-detection.md)
- 関連 runbook: [AI 判定モデル ロールバック](./ai-model-rollback.md)
- 対象コード:
  - `supabase/functions/_shared/aiLogging.ts`（`GeminiApiError` / `classifyAiError`）
  - `supabase/functions/analyze-image/index.ts`
  - `supabase/functions/analyze-audio/index.ts`
  - `src/components/features/admin/ReviewCardAI.tsx`
