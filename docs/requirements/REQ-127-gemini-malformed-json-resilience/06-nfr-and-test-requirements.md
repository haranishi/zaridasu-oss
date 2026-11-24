### 非機能要件

- [ ] **NFR-127-01: 性能 / コスト**
  - `maxOutputTokens` を 300 → 512 にすると最大コストは 1.7 倍になるが、出力 token あたりの単価が低いため写真 1 枚あたり数銭の増加（試算: ¥0.04 → ¥0.06）に収まる
  - retry は MAX_TOKENS 限定（全体の 5% 未満想定）なので呼び出し総量は 1.05〜1.1 倍

- [ ] **NFR-127-02: 後方互換**
  - 既存 `ai_call_logs.error_kind = 'json_parse'` の過去レコードは触らない
  - `posts.ai_result` の `error_kind` 旧値も互換維持（UI の default フォールバックは「AI判定失敗（詳細不明）」）

- [ ] **NFR-127-03: 観測可能性**
  - retry 発生時は `console.warn` で `[analyze-image] MAX_TOKENS につき maxOutputTokens を倍にして retry` を出す → Sentry の breadcrumb に乗る
  - `ai_call_logs.error_kind = 'gemini_truncated'` の発生回数が直近 24h で N 回超えたら、`notify-gemini-key-failure` と同様の仕組みで管理者通知する案は **REQ-127 のスコープ外** (将来検討)

### テスト要件

- [ ] **FR-127-13: ユニットテスト (Deno)**
  `supabase/functions/_shared/__tests__/sharedModules.test.ts` に追加:
  - `classifyAiError(new GeminiResponseError({ finishReason: 'MAX_TOKENS', ... }))` → `'gemini_truncated'`
  - `classifyAiError(new GeminiResponseError({ finishReason: 'SAFETY', ... }))` → `'gemini_safety'`
  - `classifyAiError(new GeminiResponseError({ finishReason: 'RECITATION', ... }))` → `'gemini_safety'`
  - `classifyAiError(new GeminiResponseError({ finishReason: null, blockReason: 'PROHIBITED_CONTENT', ... }))` → `'gemini_safety'`
  - `classifyAiError(new GeminiResponseError({ finishReason: 'STOP', ..., cause: 'JSON.parse 失敗' }))` → `'json_parse'`

- [ ] **FR-127-14: ハンドラ統合テスト**
  `supabase/functions/analyze-image/index.test.ts` に追加（既存の fetch mock パターンを踏襲）:
  - mock の Gemini が `{ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{"detected_species":"american","notes":"アメリ' }] } }] }` を返す → 1 回 retry が走る（mock 呼び出し回数で verify）
  - retry でも MAX_TOKENS のままなら最終的に `ai_result.error_kind = 'gemini_truncated'` で update される
  - mock が `{ candidates: [{ finishReason: 'SAFETY', content: { parts: [{ text: '' }] } }] }` を返す → retry なしで即 `error_kind = 'gemini_safety'`
  - mock が `{ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'Here is the result: {"detected_species":"american","species_match":true,"confidence":0.9,"image_quality":"good","is_appropriate":true,"concerns":[],"notes":"OK"}' }] } }] }` を返す → JSON 抽出が成功し正常分岐

- [ ] **FR-127-15: UI ユニットテスト**
  `src/components/features/admin/__tests__/ReviewCardAI.test.tsx` に追加:
  - `error_kind: 'gemini_truncated'` で「✂️ AI レスポンスが切れました」が amber 色、ボタンは disabled でない
  - `error_kind: 'gemini_safety'` で「🛡️ AI が分析を拒否」が赤色、ボタンは disabled

- [ ] **FR-127-16: CI ジョブの動作確認**
  - GitHub Actions の `act` か feature ブランチで `edge-functions-deploy-lag` ジョブが期待通り fail / warning を出すことを目視確認
