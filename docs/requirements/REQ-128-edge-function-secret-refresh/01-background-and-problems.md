## 背景

2026-05-12 の運用で、`supabase secrets set GEMINI_API_KEY=<新キー>` で secret を更新したにも関わらず、本番 Edge Function (`analyze-image` / `analyze-audio`) が古いキーを返し続け、Gemini API から `API key not valid (400)` を受け取り続ける事象が発生した。直接 Gemini API に新キーを叩くと 200 で動く一方、Edge Function 経由だと 400 が返る、という挙動でデバッグが長引いた。

最終的に `supabase functions deploy analyze-image analyze-audio` で**再デプロイ**することでコンテナが新しい env と共に起動し、復旧した。

この問題の核心は以下:

1. **Supabase Edge Function の secret は、`secrets set` 単体ではホットコンテナに反映されない**。コンテナの env はプロセス起動時の snapshot で、`Deno.env.get()` は呼ぶたびに同じ snapshot を返す。新 env を読むには container 再起動 (= redeploy or 自然 cold start) が必要。
2. **コードを `getGeminiApiKey()` 関数で lazy にしても無意味**。`Deno.env` 自体がスナップショットなので、関数化しても古い値を返す。
3. **CI には deploy-lag 検知 (REQ-127 FR-127-11) はあるが、secret-change-without-deploy 検知は無い**。
4. **`health-gemini` (REQ-126) は本番キーで実 Gemini を叩くが、「secret は新しいが function は古いキーで動いている」状態を能動的には区別できない**。

## 現状の問題

### 実装

- `supabase/functions/analyze-image/index.ts:53` の `getGeminiApiKey()` は lazy だが、根本的解決になっていない（Deno.env がスナップショットのため）
- `supabase/functions/analyze-audio/index.ts:58` 同上
- `supabase/functions/_shared/aiCache.ts:8-10` は `CACHE_ENABLED` / `CACHE_TTL_SECONDS` / `REFRESH_MARGIN_SECONDS` を module-level で固定読込。env 更新時はやはり再デプロイが必要
- `supabase/functions/_shared/aiRateLimit.ts:6` も `REANALYSIS_DAILY_LIMIT` を module-level で固定
- `supabase/functions/health-gemini/index.ts:47` も `getGeminiApiKey()` で lazy だが効果は限定的

### 運用

- `docs/runbooks/edge-function-deploy.md` は deploy 手順を扱うが、**「secret 更新後は対応 function を必ず redeploy」**の項目がない（あるいは弱い）
- `docs/runbooks/gemini-key-rotation.md` (REQ-126 で作成) も同様の警告が弱い
- CI (`.github/workflows/ci.yml`) には secret 変更後の自動 redeploy フックがない

### 再現 / 観測

- 2026-05-12 09:09 UTC: `supabase functions deploy analyze-image analyze-audio health-gemini notify-gemini-key-failure` 実行
- 同直後: `supabase secrets set GEMINI_API_KEY=AIzaSyASl...`
- 09:34 UTC〜09:47 UTC: 管理画面で再判定試行 → 全て `Gemini API エラー (400): API key not valid`
- 09:48 UTC: 再デプロイ → 即時復旧
- function logs では `[analyze-image] エラー: { code: 400, message: "API key not valid" }` が一貫して出ていた

