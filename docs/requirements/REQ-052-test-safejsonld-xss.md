# REQ-052: safeJsonLd の XSS エスケープ単体テスト追加

## 背景
`src/lib/seo.ts:15-17` の `safeJsonLd` は JSON-LD 構造化データを `<script type="application/ld+json">` の textContent としてシリアライズする際、`</script>` による DOM break-out を防ぐため `<` を `\u003c` に一括エスケープする実装。REQ-005（JSON-LD XSS）で追加された防御ロジックだが、実装要件は満たしつつ対応するテストが未整備で、将来 `.replace(/</g, '\\u003c')` が削除・条件付き化されても検知できない。本要件では純粋関数として 5〜6 ケースで固定化し、`dangerouslySetInnerHTML` を使う 9 箇所すべての防衛ラインを担保する。

## 守りたい不変条件
- **INV-01**: 入力オブジェクト内の任意階層に出現する `<` 文字はすべて `\u003c` にエスケープされ、出力文字列中に裸の `<` は一切残らない
- **INV-02**: エスケープ後の文字列を DOM の `<script type="application/ld+json">` の textContent として挿入しても、`</script>` による HTML パーサー break-out が発生しない（= 出力中に `</script>` のサブシーケンスが出現しない）
- **INV-03**: 出力文字列は `JSON.parse` でラウンドトリップ可能（有効な JSON として解釈でき、元オブジェクトと構造的に等価）
- **INV-04**: 非 ASCII の日本語文字（例: 「アメリカザリガニ」「秋田県」）は過剰エスケープされずそのまま保持される
- **INV-05**: 空オブジェクト `{}` / 空配列 `[]` も正しくシリアライズされる（辺縁ケース）

## 現状の検出可否
- `Glob "src/lib/__tests__/seo.test.ts"` 0 件（本ファイル自体が存在しない）
- `src/lib/__tests__/` には `constants.test.js` / `postValidation.test.ts` のみ
- `Grep "safeJsonLd" --glob="*.test.*"` 0 件、`Grep "safeJsonLd"` の結果は実装ファイル（`src/lib/seo.ts:15`）と利用側（`src/app/post/[id]/page.tsx` 等 9 箇所の `dangerouslySetInnerHTML: { __html: safeJsonLd(...) }`）のみ
- つまり現状、`safeJsonLd` の `.replace(/</g, '\\u003c')` を誰かが削除しても Vitest / ビルド / lint すべて通過してしまう

## テスト種別と環境
- **種別**: unit（純粋関数、副作用なし）
- **フレームワーク**: Vitest（既存、`vitest.config.ts:5` の `environment: 'jsdom'` をそのまま利用）
- **セットアップ**: 特になし（`import { safeJsonLd } from '@/lib/seo'` のみ）
- **配置先**: `src/lib/__tests__/seo.test.ts`

## テストケース（Given/When/Then）

### TC-01: 正常系 — 通常のオブジェクトが JSON としてシリアライズされる
- **Given**: `const obj = { '@context': 'https://schema.org', '@type': 'Report', name: 'テスト' }`
- **When**: `const out = safeJsonLd(obj)`
- **Then**:
  - `typeof out === 'string'`
  - `JSON.parse(out)` が `obj` と deep equal（INV-03）
  - `out.includes('<')` が `false`（`https://` に含まれる `<` は無いので、そもそも `<` が出てこない）

### TC-02: `</script>` 入り文字列が break-out 不可能にエスケープされる
- **Given**: `const obj = { description: '</script><script>alert(1)</script>' }`
- **When**: `const out = safeJsonLd(obj)`
- **Then**:
  - `out.includes('</script>')` が `false`（INV-02）
  - `out.includes('<')` が `false`（INV-01）
  - `out.includes('\\u003c/script>')` が `true`（エスケープ後の形）
  - `JSON.parse(out).description === '</script><script>alert(1)</script>'`（ラウンドトリップ、INV-03）

### TC-03: ネスト配列内の `<` もエスケープされる
- **Given**: `const obj = { items: [{ title: 'a<b' }, { nested: [{ text: '<svg>' }] }] }`
- **When**: `const out = safeJsonLd(obj)`
- **Then**:
  - `out.includes('<')` が `false`（INV-01）
  - `(out.match(/\\u003c/g) ?? []).length === 3`（`a<b`, `<svg`, `>` の 3 箇所の `<`）
  - `JSON.parse(out)` が元 `obj` と deep equal（INV-03）

### TC-04: 日本語／非 ASCII 文字は保持される
- **Given**: `const obj = { name: 'アメリカザリガニ', region: '秋田県秋田市', note: 'ÀÉîñ' }`
- **When**: `const out = safeJsonLd(obj)`
- **Then**:
  - `out.includes('アメリカザリガニ')` が `true`（INV-04）
  - `out.includes('秋田県秋田市')` が `true`
  - `out.includes('ÀÉîñ')` が `true`
  - `JSON.parse(out)` が元 `obj` と deep equal

### TC-05: DOM 実注入で break-out が起きないことを end-to-end 確認
- **Given**: `const obj = { payload: '</script><img src=x onerror=alert(1)>' }`、`const script = document.createElement('script'); script.type = 'application/ld+json'; script.textContent = safeJsonLd(obj); document.head.appendChild(script)`
- **When**: `document.head.querySelectorAll('script[type="application/ld+json"]').length` と `document.head.querySelectorAll('img').length` を測定
- **Then**:
  - `script` が 1 個
  - 付随して `img` 要素が 0 個（break-out していない、INV-02）
  - `JSON.parse(script.textContent!).payload` が元文字列と厳密一致

### TC-06: 空オブジェクト／配列／ネスト空のエッジケース
- **Given**: `safeJsonLd({})`、`safeJsonLd([])`、`safeJsonLd({ a: [] })`、`safeJsonLd({ a: {} })`
- **When**: それぞれを評価
- **Then**:
  - `safeJsonLd({}) === '{}'`
  - `safeJsonLd([]) === '[]'`
  - `safeJsonLd({ a: [] }) === '{"a":[]}'`
  - `safeJsonLd({ a: {} }) === '{"a":{}}'`（INV-05）
  - いずれも `JSON.parse` でラウンドトリップ成功

## カバレッジ目標
- `src/lib/seo.ts:15-17` の `safeJsonLd` 関数: statements / branches / functions / lines すべて 100%
- テスト全体の所要時間 < 100ms（純粋関数なので jsdom 起動コスト以外は極小）

## テストデータ / フィクスチャ
インラインで完結。別ファイル不要。

## 受入条件
- [ ] AC-01: `npm test -- src/lib/__tests__/seo.test.ts` がグリーン（6 TC 全 pass）
- [ ] AC-02: ネガティブ検証 — `src/lib/seo.ts:16` の `.replace(/</g, '\\u003c')` を削除して `return JSON.stringify(obj)` に戻すと TC-02 / TC-03 / TC-05 が RED になること（`out.includes('<')` / `out.includes('</script>')` / `querySelectorAll('img').length === 0` が失敗）
- [ ] AC-03: GitHub Actions（`.github/workflows/ci.yml`）で 3 回連続グリーン、かつテスト所要時間が 100ms を超えないこと（flaky なし）

## 影響範囲
- 新規: `src/lib/__tests__/seo.test.ts`
- 既存: なし（`src/lib/seo.ts` に変更なし、テスト先行で固定化するだけ）
- CI: 既存の `npm test` スクリプトで自動実行

## 優先度
- **緊急度**: 高
- **重要度**: Critical
- **理由**: 実装は 3 行で済む単純な関数だが、これが保護しているのは `src/app/post/[id]/page.tsx` / `src/app/page.tsx` など 9 箇所の `dangerouslySetInnerHTML` すべての XSS 防衛ライン。テスト追加コストが極小（5 分程度）にも関わらず、削除・条件分岐化による静かなリグレッションを確実に止められる。
