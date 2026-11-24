## 受入条件
- [ ] AC-072-01: **Given** `audio_url` 付き posts が INSERT、**When** Webhook から `handleRequest` が起動、**Then** Gemini へ 1 回呼び出され、`posts.ai_result.audio_analysis` が新構造で書き込まれ、`posts.ai_analyzed_at` が更新される。
- [ ] AC-072-02: **Given** `audio_url` が NULL の posts、**When** Webhook 起動、**Then** `{ skipped: 'no_audio' }` 200 を返し、Gemini 呼び出し 0 回、`posts.update` 0 回。
- [ ] AC-072-03: **Given** 既に `ai_result.audio_analysis.analyzed_at` が設定済みの posts、**When** Webhook が再配信で 2 回目起動（`reanalysis !== true`）、**Then** `{ skipped: 'already_analyzed' }` 200 を返し、Gemini 呼び出し 0 回（冪等性 INV-01, INV-03 相当）。
- [ ] AC-072-04: **Given** `audio_url` が 404 を返す、**When** Webhook 起動、**Then** HTTP 200 応答、`posts.ai_result.audio_analysis.error = 'audio_fetch_failed'` が記録される。
- [ ] AC-072-05: **Given** Gemini が 503 を返す、**When** Webhook 起動、**Then** HTTP 200 応答、`ai_result.audio_analysis.error` に 503 情報が記録される（Webhook リトライ嵐防止）。
- [ ] AC-072-06: **Given** Gemini が `not a json` を返す、**When** Webhook 起動、**Then** HTTP 200、`ai_result.audio_analysis.error = 'gemini_parse_failed'`。
- [ ] AC-072-07: **Given** 音声のみ投稿（photos 空）で Gemini が `{detected_species:'bullfrog', species_match:true, confidence:0.9}` を返す、**When** Webhook 起動、**Then** `ai_result.combined_decision.should_approve = true` が設定される（実際の status 変更は REQ-073）。
- [ ] AC-072-08: **Given** `GEMINI_API_KEY` 未設定の環境、**When** Webhook 起動、**Then** `{ skipped: 'no_api_key' }` 200、Gemini 呼び出し 0 回、posts 更新 0 回。
- [ ] AC-072-09: **Given** 投稿者本人（自分の user_id）が `?reanalysis=true` + Bearer token で POST、**When** 既解析済みでも処理が走り、`ai_result.audio_analysis` が新結果で上書きされる。別人の token では 403 が返る（`analyze-image` と同じセキュリティ）。
- [ ] AC-072-10: Deno 単体テスト `supabase/functions/analyze-audio/index.test.ts` で AC-072-02 〜 AC-072-08 の 7 ケースを Given/When/Then で検証。`fetch` / `createClient` を stub。

## 影響範囲
- 新規: `supabase/functions/analyze-audio/index.ts`（約 350 行、analyze-image と同規模）
- 新規: `supabase/functions/analyze-audio/index.test.ts`
- 変更: `.github/workflows/ci.yml`（REQ-050 で Deno セットアップ済みなら両方のテストを実行する glob に拡張）
- 設定: Supabase Dashboard → Webhooks で新規 Webhook 登録（運用手順）
- 設定: Supabase Dashboard → Edge Functions → `analyze-audio` デプロイ
- 環境変数: 既存の `GEMINI_API_KEY` を共用

## 優先度
- **緊急度**: High
- **重要度**: High
- **理由**: 音声投稿の中核ロジック。UI（REQ-069）・Storage（REQ-070）・Schema（REQ-071）が揃っても AI 判定が無いと自動承認されず、鳴き声投稿は手動審査のみになってしまい価値が半減する。
