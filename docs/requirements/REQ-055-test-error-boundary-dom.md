# REQ-055: error.tsx の DOM 検証テスト追加

## 背景
`src/app/error.tsx` は REQ-036 で日本語化と `error.message` 非表示（情報漏洩防止）を実装した Global Error Boundary。REQ-016 系の chunk-load リロード戦略（`CHUNK_RELOAD_KEY` による無限ループ防止）も同ファイルに同居しており、複数の不変条件が単一コンポーネントに集約されている。
DOM レベルの回帰テストが無く、「エラーメッセージを丁寧に見せるため」等の良かれと思った変更で `error.message` が再露出する、日本語文言が戻る、chunk reload が無限ループ化するといった複合リグレッションが起こりうる。

## 守りたい不変条件
- INV-01: `error.message` の文字列が DOM の `textContent` / 属性値のいずれにも現れない（`src/app/error.tsx:69-103` の JSX に `{error.message}` が無いことを DOM ベースで保証）
- INV-02: `'エラーが発生しました'`（h1）, `'再試行'`（button）, `'ホームに戻る'`（link）の日本語文言が表示される（`src/app/error.tsx:75,91,99`）
- INV-03: `error.digest` が truthy の場合のみ `エラーID: {digest}` が表示される（`src/app/error.tsx:82-84`）。`digest` が undefined の場合はこの `<p>` が存在しない
- INV-04: chunk load error を受けた際、`sessionStorage.getItem(CHUNK_RELOAD_KEY) === '1'` の場合は `hardReloadWithCacheReset` / `window.location.reload` を呼ばず、`sessionStorage.removeItem(CHUNK_RELOAD_KEY)` のみ行う（`src/app/error.tsx:48-52` の無限ループ防止）
- INV-05: マウント時に `logError(error, 'app/error')` が呼ばれる（`src/app/error.tsx:45`）

## 現状の検出可否
- `src/app/__tests__/` ディレクトリが存在しない（Glob 確認済み）
- `error.tsx` を import しているテストは 0 件（Grep 確認）
- ゆえに `<p>{error.message || 'デフォルト'}</p>` のような情報漏洩を再導入しても、文言を英語に戻しても、`CHUNK_RELOAD_KEY` の早期 return を外しても検出不能

## テスト種別と環境
- **種別**: unit（DOM + イベント）
- **フレームワーク**: Vitest + `@testing-library/react`（既存）+ `@testing-library/user-event`（既存）
- **セットアップ**:
  - `vi.mock('@/utils/errorHandler', () => ({ logError: vi.fn() }))`
  - `window.location.reload` を `vi.fn()` でスタブ（`Object.defineProperty(window, 'location', { value: { ...window.location, reload: reloadMock }, writable: true })`）
  - `sessionStorage` は jsdom に既存だが、各テストの `beforeEach` で `sessionStorage.clear()`
  - `navigator.serviceWorker` が無い jsdom では `Object.defineProperty(navigator, 'serviceWorker', { value: { getRegistrations: vi.fn().mockResolvedValue([]) }, configurable: true })` でスタブ
  - `global.caches` を `{ keys: vi.fn().mockResolvedValue([]), delete: vi.fn() }` でスタブ
- **配置先**: `src/app/__tests__/error.test.tsx`

## テストケース（Given/When/Then）

### TC-01: error.message が DOM に現れない（INV-01）
- **Given**: `error = new Error('Database connection failed: password=SECRET123')` と `reset = vi.fn()`
- **When**: `render(<GlobalError error={error} reset={reset} />)`
- **Then**:
  - `container.textContent` に `'Database connection failed'` が含まれない
  - `container.textContent` に `'password=SECRET123'` が含まれない
  - `container.innerHTML` にも上記 2 つが含まれない（属性値経由の漏洩を排除）

### TC-02: 日本語文言が全て表示される（INV-02）
- **Given**: 任意の `error`
- **When**: render
- **Then**:
  - `screen.getByRole('heading', { level: 1 }).textContent === 'エラーが発生しました'`
  - `screen.getByRole('button', { name: '再試行' })` が存在
  - `screen.getByRole('link', { name: 'ホームに戻る' })` が存在し、`href === '/'`
  - 説明文 `'申し訳ありません。予期せぬ問題が発生しました。もう一度お試しください。'` が含まれる

### TC-03: digest の有無で表示が分岐（INV-03）
- **Given 1**: `error = Object.assign(new Error('x'), { digest: 'abc123' })`
- **When 1**: render
- **Then 1**: `screen.getByText('エラーID: abc123')` が存在
- **Given 2**: `error = new Error('x')`（digest 無し）
- **When 2**: render
- **Then 2**: `screen.queryByText(/エラーID:/)` が null

### TC-04: chunk load error で 2 回目のリロードは抑止される（INV-04）
- **Given**: `sessionStorage.setItem('chunk-reload-attempted', '1')` を事前にセットし、`error = new Error('Loading chunk 42 failed')`
- **When**: `render(<GlobalError error={error} reset={vi.fn()} />)` して `act()` 完了を待つ
- **Then**:
  - `window.location.reload` が呼ばれていない（call count === 0）
  - `sessionStorage.getItem('chunk-reload-attempted') === null`（removeItem 済み）
- **補助ケース**: `sessionStorage` が空の状態で同じ chunk error を render すると、`sessionStorage` に `'1'` がセットされ、`navigator.serviceWorker.getRegistrations` と `caches.keys` が呼ばれる

### TC-05: マウント時に logError が error と context='app/error' で呼ばれる（INV-05）
- **Given**: `error = new Error('boom')`, `logError` は mocked
- **When**: render
- **Then**: `logError` が 1 回呼ばれ、第 1 引数 === `error`、第 2 引数 === `'app/error'`

## カバレッジ目標
- `src/app/error.tsx` の branch カバレッジ ≥ 90%（chunk 判定 / digest 有無 / alreadyAttempted の 3 分岐を網羅）
- line カバレッジ ≥ 95%

## テストデータ / フィクスチャ
- 汎用エラー: `new Error('boom')`
- 情報漏洩疑いエラー: `new Error('Database connection failed: password=SECRET123')`
- chunk error: `new Error('Loading chunk 42 failed')`, `new Error('Loading CSS chunk 7 failed')`, `new Error('Failed to fetch dynamically imported module')`
- digest 付き: `Object.assign(new Error('x'), { digest: 'abc123' })`

## 受入条件
- [ ] AC-01: `npm test -- src/app/__tests__/error.test.tsx` が 5 ケース通過
- [ ] AC-02: ネガティブ検証 — `src/app/error.tsx:79` の `<p>` を `<p>{error.message || ...}</p>` に改変すると TC-01 が失敗し、`'エラーが発生しました'` を `'Something went wrong'` に戻すと TC-02 が失敗し、`src/app/error.tsx:48-52` の早期 return を削除すると TC-04 で `reload` が呼ばれて失敗する
- [ ] AC-03: CI で 3 回連続成功（jsdom の sessionStorage / serviceWorker スタブが flaky でない）

## 影響範囲
- 新規: `src/app/__tests__/error.test.tsx`
- 既存への影響: `vitest.setup.ts` に serviceWorker / caches スタブを追加する可能性あり（テスト内 scoped で完結させるのが望ましい）

## 優先度
- **緊急度**: High
- **重要度**: High
- **理由**: 情報漏洩（INV-01）はセキュリティイシューであり、chunk reload 無限ループ（INV-04）はユーザー端末を実質使用不能にする致命バグ。いずれも過去に類似の意図せぬリグレッションが発生している領域で、DOM レベルの smoke テストで確実に防止できる。
