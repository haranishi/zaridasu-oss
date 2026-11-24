# REQ-053: /api/og 入力サニタイズ単体テスト追加

## 背景
`src/app/api/og/route.tsx` は REQ-042 で入力サニタイズを、REQ-047 で `SPECIES` / `DEFAULT_SPECIES_EMOJI` 定数ルックアップを導入した Edge Runtime の OG 画像生成 API である。
この API は SNS 共有やキャッシュ汚染の入口になるため、サニタイズ仕様が回帰無く維持されることを自動テストで保証する必要がある。
現状 `src/app/api/` 配下には `__tests__/` ディレクトリが存在せず、いかなるサニタイズ仕様変更も CI で検出できない。

## 守りたい不変条件
- INV-01: `title` は `trim().slice(0, TITLE_MAX)` すなわち最大 80 文字に必ず切り詰められる（`src/app/api/og/route.tsx:7,16`）
- INV-02: `area` は `trim().slice(0, AREA_MAX)` すなわち最大 40 文字に切り詰められる（`src/app/api/og/route.tsx:8,17`）
- INV-03: 未知または不正な `species` 値は `DEFAULT_SPECIES_EMOJI`（`🗺️`）にフォールバックする（`src/app/api/og/route.tsx:18-19` と `src/lib/constants.ts:74`）
- INV-04: 空文字・空白のみの `title` / `area` はそれぞれ既定値 `'ザリダス'` / `'秋田県'` にフォールバックする（`src/app/api/og/route.tsx:16-17`）
- INV-05: 10,000 文字級の攻撃的入力でも HTTP 200 を返し、レスポンスヘッダ `Content-Type: image/png` で PNG を生成する

## 現状の検出可否
- `src/app/api/` 配下には `__tests__` ディレクトリが存在しない（Glob 確認済み）
- `src/app/api/og/route.tsx:10-89` は `GET` ハンドラのみを export しており、既存のどのテストからも呼ばれていない
- ゆえに `slice(0, TITLE_MAX)` を削除、`DEFAULT_SPECIES_EMOJI` フォールバックを外す、既定値文字列を変更する等のリグレッションを CI で検出不能

## テスト種別と環境
- **種別**: unit（route handler 単体テスト）
- **フレームワーク**: Vitest（既存、`vitest.config.ts:6` で `environment: 'jsdom'`）
- **セットアップ**:
  - テスト内で `route.tsx` から `GET` を直接 import し、`new NextRequest(new URL('http://localhost/api/og?...'))` を渡して呼び出す
  - Edge Runtime 固有 API（`next/og` の `ImageResponse`）はそのまま利用し、`response.status` と `response.headers.get('content-type')` のみ検証（PNG バイト比較は行わない）
  - 必要に応じて `vi.mock('next/og', ...)` でレスポンス本体を軽量化してもよい（ただし INV-05 では実 `ImageResponse` を経由する 1 ケースは残すこと）
- **配置先**: `src/app/api/og/__tests__/route.test.tsx`

## テストケース（Given/When/Then）

### TC-01: title が TITLE_MAX(80) 超の場合に切り詰められる（INV-01）
- **Given**: `?title=` に 150 文字の文字列 `'あ'.repeat(150)` を付与
- **When**: `GET(new NextRequest(url))` を呼ぶ
- **Then**:
  - `response.status === 200`
  - `vi.mocked(ImageResponse)` の第 1 引数 JSX ツリーを探索し、title 表示ノードの textContent が 80 文字であること
  - 81 文字目以降が含まれないこと

### TC-02: area が AREA_MAX(40) 超の場合に切り詰められる（INV-02）
- **Given**: `?area=` に 100 文字の `'x'.repeat(100)` を付与
- **When**: `GET` を呼ぶ
- **Then**: area 表示ノードの textContent が 40 文字であること

### TC-03: 未知 species が DEFAULT_SPECIES_EMOJI にフォールバック（INV-03）
- **Given**: `?species=<script>alert(1)</script>` を付与
- **When**: `GET` を呼ぶ
- **Then**:
  - `response.status === 200`
  - emoji 表示ノードの textContent が `DEFAULT_SPECIES_EMOJI`（`'\uD83D\uDDFA\uFE0F'`）と一致
  - `<script>` 文字列がレスポンス body / JSX ツリーのどこにも現れない

### TC-04: 空 title/area が既定値に戻る（INV-04）
- **Given**: `?title=%20%20&area=`（空白のみと空）
- **When**: `GET` を呼ぶ
- **Then**: title ノードに `'ザリダス'`、area ノードに `'秋田県'` が表示される

### TC-05: 既知 species `american` / `bullfrog` は対応絵文字を返す（INV-03 補強）
- **Given**: `?species=american` / `?species=bullfrog` の 2 ケース
- **When**: それぞれ `GET` を呼ぶ
- **Then**: emoji がそれぞれ `SPECIES[0].emoji`（🦞）/ `SPECIES[1].emoji`（🐸）と一致

### TC-06: 10,000 文字攻撃入力でも 200 + PNG を返す（INV-05）
- **Given**: `?title=${'a'.repeat(10000)}&area=${'b'.repeat(10000)}&species=${'c'.repeat(10000)}`
- **When**: 実 `ImageResponse` を経由して `GET` を呼ぶ
- **Then**:
  - `response.status === 200`
  - `response.headers.get('content-type')` が `image/png` で始まる
  - 実行時間 < 1 秒

## カバレッジ目標
- `src/app/api/og/route.tsx` の branch カバレッジ ≥ 90%（title/area のデフォルト分岐と species ヒット/未ヒット分岐を網羅）
- line カバレッジ ≥ 95%

## テストデータ / フィクスチャ
- 長文攻撃: `'あ'.repeat(150)`, `'x'.repeat(100)`, `'a'.repeat(10000)`
- XSS 風: `<script>alert(1)</script>`, `"><img src=x>`
- 既知 species: `'american'`, `'bullfrog'`
- 未知 species: `'unknown'`, `''`, `'<script>'`

## 受入条件
- [ ] AC-01: `npm test -- src/app/api/og/__tests__/route.test.tsx` が全ケース通過
- [ ] AC-02: ネガティブ検証 — `src/app/api/og/route.tsx:16` の `.slice(0, TITLE_MAX)` を削除すると TC-01 が失敗し、`src/app/api/og/route.tsx:19` の `?? DEFAULT_SPECIES_EMOJI` を `?? ''` に変えると TC-03 が失敗する
- [ ] AC-03: CI 上で 3 回連続成功（flaky でない、実行 < 1 秒）

## 影響範囲
- 新規: `src/app/api/og/__tests__/route.test.tsx`
- 参照のみ: `src/app/api/og/route.tsx`, `src/lib/constants.ts`

## 優先度
- **緊急度**: High
- **重要度**: High
- **理由**: OG API は CDN 長時間キャッシュ（`max-age=86400, s-maxage=604800`）を持つため、サニタイズ仕様の退行がそのままキャッシュ汚染につながる。REQ-042/REQ-047 で入れた保護を自動化しなければ一度きりの人手レビューに依存することになる。
