### テスト要件

- [ ] **FR-125-07: Edge Function ユニットテスト**
  `supabase/functions/analyze-image/index.test.ts` に以下を追加:
  - 画像 fetch 失敗 (mock の `fetch` が 404) → `aiResult.error_kind === 'image_fetch'`
  - Gemini API が 500 → `aiResult.error_kind === 'gemini_api'`
  - Gemini が non-JSON を返す → `aiResult.error_kind === 'json_parse'`
  - 成功時は `ai_failure_count` を 0 にリセットするクエリが流れる
  - 失敗時は `ai_failure_count = ai_failure_count + 1` のクエリが流れる

- [ ] **FR-125-08: API キー Redaction テスト**
  Gemini API のエラーレスポンスに URL 形式 `https://generativelanguage.googleapis.com/...?key=AIzaSyTEST` が含まれるケースで、`ai_call_logs.error_message` の保存値が `key=[REDACTED]` に置換されていることを verify する。

- [ ] **FR-125-09: UI ユニットテスト（Vitest + RTL）**
  `src/components/features/admin/__tests__/ReviewCardAI.test.tsx` を新設し以下を検証:
  - `error_kind: 'image_fetch'` で文言「画像取得失敗」が表示
  - `error_kind: 'gemini_api'` で文言「AI API エラー」が表示
  - `error_kind: 'json_parse'` で文言「AI が分析を拒否」+ 赤系カラー
  - 折りたたみ展開で `error_message` の冒頭が見える
  - `ai_failure_count >= 3` で再判定ボタンが disabled

- [ ] **FR-125-10: E2E (Playwright)**
  `tests/e2e/admin-reanalysis.spec.ts` を新設:
  - 認証済み admin で `/admin/posts` を開く
  - error 付き投稿の「🔄 再判定する」をクリック
  - supabase.functions.invoke が呼ばれることを `page.route` で mock 確認
  - `ai_failure_count >= 3` の投稿でボタンが disabled になっている
