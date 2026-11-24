### 問題F: `analyze-image` の最終catchだけ redact を通していない — Low

`supabase/functions/analyze-image/index.ts:1249-1250`:

```ts
} catch (e) {
  console.error("[analyze-image] エラー:", e);
  return new Response(JSON.stringify({ error: String(e) }), {
```

姉妹実装（`analyze-audio:848` / `health-gemini:118`）は redact を通している。

**現時点でAPIキーが応答に漏れる経路は無いことを検証済み**である（写真ごとの失敗は `:1003` で redact され、`aiCache` のキー入りURLは `:50, :59` の catch で握り潰されている）。したがって実害は現在ゼロだが、`allSettled` の外側に外部呼び出しを1つ追加した瞬間に漏洩経路になる。修正は姉妹実装に合わせる**1行**である。

### 問題G: `_shared/mailer.ts` が redact せず throw し、呼び出し側の fail-soft catch がそのまま出力 — Low

`supabase/functions/_shared/mailer.ts:178-181`:

```ts
if (!res.ok) {
  const err = await res.text().catch(() => '')
  throw new Error(`Resend ${res.status}: ${err}`)
}
```

この Error は呼び出し側の fail-soft catch で `console.error(..., e)` として出力されるため（`notify-dormant-reengage/index.ts:111` / `notify-weekly-digest/index.ts:177` / `notify-research-adopted`）、**宛先メール入りのエラー本文が Edge ログに残る**（REQ-211）。

`notify-survey-request:83-86` は同じ箇所で `redactAiErrorMessage(err)` を通しており、**mailer 側を1箇所直せば3関数がまとめて救われる**。

### 問題H: Edge Function の実行時依存（Deno）に自動更新経路が無い — Medium

`supabase/functions/deno.lock:4` は supabase-js を **2.105.4** に凍結している。

```json
"https://esm.sh/@supabase/supabase-js@2": "https://esm.sh/@supabase/supabase-js@2.105.4",
```

一方 `package.json:36` は `"@supabase/supabase-js": "^2.110.7"` である。`ci.yml:141` の `deno cache --frozen` によりロックは固定強制されるため、**フロント 2.110.x と Edge 2.105.4 の別バージョンSDKが恒常化**する。

`.github/dependabot.yml` の `package-ecosystem` は **npm と github-actions のみ**で、Deno エコシステムは対象外である。`deno.land/std@0.168.0`（2022年系）も同様に凍結され続けている（`_shared/__tests__/supabaseAdmin.test.ts` の import 等）。

REQ-288 は npm 側の滞留のみを扱っており、Deno 側は手つかずである。

### 問題I: `backup.yml` だけ Supabase CLI が `latest` — Low

`.github/workflows/backup.yml:86-87`:

```yaml
uses: supabase/setup-cli@...
with:
  version: latest
```

`ci.yml:180`（deploy-lag ジョブ）と `:341` は **2.106.0 にピン**しており、理由も明記されている。

> 'latest' は毎回 Supabase API へ最新版を問い合わせるため、一時的な "Failed to resolve latest Supabase CLI release: Gateway Time-out" でジョブが落ちる

つまり **CI側は既知の flake として対処済みなのに、日次バックアップだけが未対処**である。バックアップが落ちれば RPO 24h（NFR-217-02）が静かに崩れ、失敗通知は GitHub 既定メールのみである。

### 問題J: `eval:ai` / `cost:ai` がCI・定期実行に一切配線されていない — Low

`package.json:21-22` に2つのスクリプトが定義されている。

```json
"eval:ai": "tsx scripts/eval-ai-analysis.ts",
"cost:ai": "tsx scripts/calc-ai-cost.ts",
```

`.github/workflows/` からの参照は **0件**である。`i18n:check` や `schema:check` は CI に配線済みであるため、**非対称**である。

結果、`GEMINI_MODEL` やプロンプトを変更したときの**精度退行**と**単価増**を検知する定期実行が無い。REQ-279 で未整備のまま残っている `ai_call_logs` の保持ポリシーと合わせて、「気づいたら課金が膨らんでいた」構図になっている。
