#### E. モデル選定の確認

- [ ] **FR-130-10: GEMINI_AUDIO_MODEL の経緯確認 + ドキュメント化**
  `docs/runbooks/ai-model-rollback.md` に追記:
  - `gemini-2.5-flash` (audio) を採用した経緯と精度評価データ
  - thinkingBudget=0 にすると flash と flash-lite の挙動がどう変わるか
  - flash-lite へ戻すべきかの判断基準
  
  必要なら本番の env を `gemini-2.5-flash-lite` に戻すか、両者を A/B 評価する設計を起票（**REQ-131 候補**として別途）。

### 非機能要件

- [ ] **NFR-130-01: コスト**
  thinkingBudget=0 にすると output token が劇的に減る (現状の thinking 1000+ token → 80 token 前後)。**コストは 10 分の 1 程度に減る見込み**。

- [ ] **NFR-130-02: 後方互換**
  既存の `ai_call_logs` レコードと UI 表示は触らない。新規ログから usage が NULL でなくなる方向の変更。

- [ ] **NFR-130-03: 観測可能性**
  retry 2 回経路でも `console.warn` で attempt 番号を出すので、Sentry / Supabase logs で確認できる。

### テスト要件

- [ ] **FR-130-11: generationConfig 配線テスト**
  `supabase/functions/_shared/__tests__/sharedModules.test.ts` または個別テストに追加:
  - mock Gemini が `body.generationConfig.thinkingConfig.thinkingBudget === 0` で呼ばれることを verify
  - env `GEMINI_THINKING_BUDGET=128` 時に `thinkingBudget: 128` で呼ばれることを verify
  - `responseSchema` がリクエストボディに含まれることを verify

- [ ] **FR-130-12: retry 2 回経路のテスト**
  `analyze-image/index.test.ts` に追加:
  - mock Gemini が 1 回目・2 回目とも MAX_TOKENS → 3 回目で成功 → 正常 200 + ai_result が書かれる
  - mock Gemini が 3 回とも MAX_TOKENS → final 失敗、`error_kind='gemini_truncated'`

- [ ] **FR-130-13: usage が GeminiResponseError に乗るテスト**
  - mock Gemini が `usageMetadata: { promptTokenCount: 600, candidatesTokenCount: 1024 }` で MAX_TOKENS → catch した `GeminiResponseError.usage` が `{input: 600, output: 1024}` であることを verify
  - 最終的に `ai_call_logs.input_tokens=600`, `output_tokens=1024` で記録されることを verify
