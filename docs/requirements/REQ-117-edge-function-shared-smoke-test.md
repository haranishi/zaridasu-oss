# REQ-117: Edge Function `_shared` 共通モジュールの smoke test 拡張

> 親 REQ: REQ-092
> 関連 REQ: REQ-050（test-analyze-image-idempotency）

## 背景
Supabase Edge Functions が 5 本存在：
- `supabase/functions/analyze-image`
- `supabase/functions/analyze-audio`
- `supabase/functions/notify-comment`
- `supabase/functions/notify-post-status`
- `supabase/functions/notify-survey-request`

これらは `supabase/functions/_shared/` の共通モジュール（CORS ヘッダー / Supabase admin client 生成 / 認証ヘルパー等）に依存している可能性が高い。

REQ-050 で `analyze-image` の冪等性テストが要件化されているが、**`_shared` 共通モジュール自体の smoke test は無い**。`_shared` の API 変更が他の Edge Function を壊しても CI で気づけない。

## 現状の問題
- `supabase/functions/_shared/` の中身が CI で検証されていない
- `.github/workflows/ci.yml` の `edge-functions` ジョブは `deno test --allow-env --allow-net --allow-read supabase/functions/` で全関数を一括実行しているが、テスト未実装の関数があれば素通り
- `_shared` の helper を import するファイルが import path 不一致で壊れた場合、デプロイ時まで気づけない

## 目的
Edge Function 全体を CI で smoke check 可能にし、`_shared` の変更による横断的破損を防ぐ。

## 要件

### 機能要件
- [ ] FR-117-01: `supabase/functions/_shared/__tests__/cors.test.ts`（新規）— CORS ヘッダーが期待通りに返ることを deno test
- [ ] FR-117-02: `supabase/functions/_shared/__tests__/supabaseAdmin.test.ts`（新規）— admin client が SERVICE_ROLE_KEY で初期化されることを test
- [ ] FR-117-03: 各 Edge Function に最低 1 件の smoke test（200 OK 系）を追加：
  - `notify-comment/__tests__/handler.test.ts`
  - `notify-post-status/__tests__/handler.test.ts`
  - `notify-survey-request/__tests__/handler.test.ts`
  - `analyze-audio/__tests__/handler.test.ts`
  - （`analyze-image` は REQ-050 で対応済前提）
- [ ] FR-117-04: `_shared` モジュールの import path（`../_shared/cors.ts` 等）が壊れた場合に test が落ちることを確認
- [ ] FR-117-05: deno-typescript の strict 設定確認（`tsconfig.json` または deno 設定）

### 非機能要件
- [ ] NFR-117-01: CI の `edge-functions` ジョブが 2 分以内で完走
- [ ] NFR-117-02: テスト用に外部 API（Resend / OpenAI 等）を叩かない（mock）
- [ ] NFR-117-03: deno のキャッシュを CI で再利用してビルド時間を抑える

## 受入条件
- [ ] AC-01: 上記 6 ファイルのテストが存在
- [ ] AC-02: `deno test supabase/functions/` で全テスト pass
- [ ] AC-03: GitHub Actions の `edge-functions` ジョブが pass
- [ ] AC-04: `_shared/cors.ts` を意図的に壊すと CI が fail
- [ ] AC-05: REQ-050 の analyze-image テストとの重複・整合性 OK

## 影響範囲
- `supabase/functions/_shared/__tests__/`（新規）
- `supabase/functions/{notify-*,analyze-audio}/__tests__/`（新規）
- `.github/workflows/ci.yml`（必要に応じて deno cache 設定）

## 優先度
- **緊急度**: Low
- **重要度**: Medium
- **理由**: バックエンド側の信頼性向上。1 関数あたり 30 分 × 5 関数 = 約半日。

## 実装メモ
- deno test のサンプル：
  ```ts
  // supabase/functions/_shared/__tests__/cors.test.ts
  import { assertEquals } from 'https://deno.land/std/assert/mod.ts'
  import { corsHeaders } from '../cors.ts'

  Deno.test('cors headers include allowed origins', () => {
    assertEquals(corsHeaders['Access-Control-Allow-Origin'], '*')
    assertEquals(typeof corsHeaders['Access-Control-Allow-Headers'], 'string')
  })
  ```
- handler test では `Deno.serve` ではなく export された function を直接呼ぶ
- mock: Supabase クライアント呼び出しを stub 化（`Deno.test` の global `fetch` を override）
- `_shared` のファイル一覧を最初に把握してテスト対象を網羅
