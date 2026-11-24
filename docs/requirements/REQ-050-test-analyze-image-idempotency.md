# REQ-050: analyze-image Edge Function の冪等性と失敗時ガードの自動テスト追加

## 背景
`supabase/functions/analyze-image/index.ts:169-353` は Supabase DB Webhook（`posts` INSERT）から起動され、Gemini API で写真を解析して `status='approved' / 'rejected'` を自動付与する。重要な外部副作用（Gemini 呼び出し・`posts` 更新）を伴うためテスト不在が大きなリスク。

特にソース確認の結果、現状のコードには **`ai_analyzed_at IS NOT NULL` での早期 return が存在しない**（`index.ts:183` でスキップする条件は `photos` 欠如のみ）。Webhook が何らかの理由で再実行された場合、Gemini へ二重課金・`ai_analyzed_at` 上書き・既に `approved` になった投稿が `pending` に差し戻される（`index.ts:322-329`）などの副作用が出る。本要件ではまずテストで現状挙動を固定し、INV-03 の failing ケースを意図的に残して冪等性の実装要件を駆動する（テスト先行）。

## 守りたい不変条件
- **INV-01**: 同一 `post_id` で 2 回呼ばれた場合、`posts.update` が発行される回数は 1 回（2 回目は早期 return）
- **INV-02**: Gemini API が 5xx を返したとき、`posts.status` が `pending` のまま維持され、`approved` に昇格しない（`index.ts:304-307` の `shouldAutoApprove` が false になる）
- **INV-03**: 呼び出されたレコードが既に `ai_analyzed_at IS NOT NULL` の場合、`fetch(GEMINI_ENDPOINT, ...)` は呼ばれない（Gemini 再呼び出し防止）
- **INV-04**: Gemini レスポンスの JSON パースに失敗（`index.ts:166` の `JSON.parse` が throw）した場合、レスポンスは 200 で返り `ai_result.error` に理由が記録される。Supabase DB Webhook のリトライ嵐を防ぐため 500 系は返さない
- **INV-05**: 写真なし（`record.photos` が空配列 or undefined）の場合、`skipped: 'no_photos'` を 200 で返し、Gemini / Supabase update とも呼ばない（`index.ts:183-188`）

## 現状の検出可否
- `Glob "supabase/functions/**/*.test.*"` 0 件（Edge Function のテスト皆無）
- `Glob "supabase/functions/**/*.spec.*"` 0 件
- `package.json` の `scripts.test` は Vitest のみで Deno 環境は CI に含まれていない
- 本ファイルは Deno runtime（`Deno.env` / `https://deno.land/std` import）で、Vitest（Node + jsdom）からは直接 import できない
- 手動テストでは Gemini API への実課金発生 + 本番 Supabase への書き込み副作用があり、継続的検証に不向き

## テスト種別と環境
- **種別**: unit（Deno test、外部 I/O は全てスタブ）
- **フレームワーク**: `deno test`（Deno 標準）+ `https://deno.land/std@0.224.0/testing/mock.ts` の `stub` / `spy`
- **セットアップ**:
  - `globalThis.fetch` を `stub` で差し替え、URL に応じて `image/jpeg` ダミーレスポンスか Gemini モックレスポンスを返す
  - `createClient`（`https://esm.sh/@supabase/supabase-js@2`）は `import.meta.resolve` + `Deno.test({ sanitizeResources: false, sanitizeOps: false })` 下で `import` 時にモジュールレベル置換するのが困難なため、`index.ts` を **副作用なし export** できるように軽くリファクタする（`serve` 呼び出しと handler 本体を分離し、handler をテスト可能に export）
  - `Deno.env.get` は `Deno.env.set` で事前に `GEMINI_API_KEY='test'` / `SUPABASE_URL='http://localhost'` / `SUPABASE_SERVICE_ROLE_KEY='test'` を設定
  - モック Supabase client は `{ from: () => ({ update: (p) => ({ eq: () => ({ error: null }) }) , select: ..., single: ... }) }` をオブジェクトで手実装
- **配置先**: `supabase/functions/analyze-image/index.test.ts`

## テストケース（Given/When/Then）

### TC-01: 冪等性 — 同一 post_id で 2 回呼ばれても update は 1 回
- **Given**: 1 回目は `ai_analyzed_at=null`、2 回目の呼び出し直前に Supabase client のモックが `ai_analyzed_at='2026-04-21T00:00:00Z'` を返すよう差し替え。`fetch` stub は Gemini に対し valid JSON を返す
- **When**: `await handler(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ record: { id: 'p1', photos: ['http://x/1.jpg'], species: 'american' } }) }))` を 2 回実行
- **Then**:
  - 1 回目: `fetch` が Gemini へ 1 回、`supabase.from('posts').update` が 1 回呼ばれる
  - 2 回目: `fetch` が Gemini へ呼ばれない（call count + 0）、`update` も呼ばれない、レスポンスは `{ skipped: 'already_analyzed' }` 等で 200（INV-01 / INV-03）
  - **現状コードはこれを満たさないため TC-01 は RED。実装要件駆動のテストとして維持**

### TC-02: Gemini 5xx 時に status が approved に昇格しない
- **Given**: `fetch` stub は Gemini エンドポイントに対し `new Response('upstream error', { status: 503 })` を返す。画像取得は 200 OK
- **When**: `handler` に `{ record: { id: 'p2', photos: ['http://x/1.jpg'], species: 'american', status: 'pending' } }` を POST
- **Then**:
  - `supabase.update` に渡される payload に `status` キーが含まれない（`approved` にも `rejected` にもならない、`index.ts:304-329` の条件すべて false）
  - `ai_result.error` が含まれている（`index.ts:246-248` の catch 経路）
  - HTTP レスポンスは 200（INV-02）

### TC-03: ai_analyzed_at がすでにある投稿は Gemini を呼ばない（要実装）
- **Given**: `handler` に `{ record: { id: 'p3', photos: ['http://x/1.jpg'], species: 'american', ai_analyzed_at: '2026-04-01T00:00:00Z' } }` を POST
- **When**: 1 度呼び出す
- **Then**:
  - Gemini への fetch 呼び出し回数 = 0
  - `supabase.update` 呼び出し回数 = 0
  - レスポンス `{ skipped: 'already_analyzed' }` で 200（INV-03）
  - **現状コードにはこのガードが無いので RED。実装側で `if (record.ai_analyzed_at) return skipped` を追加させるドライバテスト**

### TC-04: Gemini レスポンスが不正 JSON でも 200 を返し error を記録
- **Given**: `fetch` stub は Gemini に対し `{ candidates: [{ content: { parts: [{ text: 'not a json ```' }] } }] }` を返す（`index.ts:165-166` の cleaned で `JSON.parse` が throw）
- **When**: `handler` を POST で 1 回呼ぶ
- **Then**:
  - レスポンス HTTP status = 200（500 ではない、INV-04）
  - `supabase.update` の payload に `ai_result.error` が含まれる（`allSettled` の rejected 経路、`index.ts:246-249`）
  - Webhook リトライ嵐にならない（200 応答）

### TC-05: photos なしはスキップして 200
- **Given**: `handler` に `{ record: { id: 'p5', photos: [], species: 'american' } }` を POST
- **When**: 1 度呼ぶ
- **Then**:
  - レスポンス body `{ skipped: 'no_photos' }`、status 200
  - Gemini fetch 呼び出し 0 回、`supabase.update` 0 回（INV-05）

## カバレッジ目標
- `supabase/functions/analyze-image/index.ts:174-352` の `serve` 内 handler のうち、正常系 / Gemini 5xx / JSON パース失敗 / photos 無し / 既解析済み の 5 分岐を到達
- `aggregateResults`（`index.ts:50-114`）は別単体テストで既に呼ばれる（TC-01 の正常系で間接到達）
- 関数 coverage ≧ 80%、branches ≧ 70%

## テストデータ / フィクスチャ
- 小さな 1×1 px JPEG バイナリを base64 文字列でインライン定数化（`TEST_JPEG_BASE64`）し、画像 fetch モックで `Uint8Array.from(atob(TEST_JPEG_BASE64), c => c.charCodeAt(0)).buffer` を返す
- Gemini モックレスポンス 2 種（成功 / 5xx / 不正 JSON）をファイル先頭でファクトリ関数化

## 受入条件
- [ ] AC-01: `deno test --allow-env --allow-net=none supabase/functions/analyze-image/index.test.ts` でグリーン（TC-02 / TC-04 / TC-05 が pass）。TC-01 / TC-03 は本要件のタイミングでは RED を許容し、実装完了時点で pass
- [ ] AC-02: ネガティブ検証 — `supabase/functions/analyze-image/index.ts:304-307` の `shouldAutoApprove` 条件から `!aiResult.error` を外すと TC-02 が RED。`index.ts:184-188` の `no_photos` 早期 return を削除すると TC-05 が RED
- [ ] AC-03: CI（`.github/workflows/ci.yml`）に `denoland/setup-deno@v1` を追加し `deno test` ステップを挿入、3 回連続グリーン

## 影響範囲
- 新規: `supabase/functions/analyze-image/index.test.ts`
- 軽微リファクタ: `supabase/functions/analyze-image/index.ts:169-353` の `serve(async (req) => { ... })` の中身を `export async function handler(req: Request, deps?: { supabase?, fetch? }): Promise<Response>` に切り出し（`serve(handler)` で呼ぶ）。デプロイ挙動は変化なし
- CI: `.github/workflows/ci.yml` に Deno セットアップ追加

## 優先度
- **緊急度**: 高
- **重要度**: Critical
- **理由**: 自動承認フローは金銭コスト（Gemini 課金）・セキュリティ（承認バイパス）・UX（意図しない rejected）に直結。現状 0 件テストのままデプロイされており、冪等性欠落は本要件のテストによって初めて明示化される。
