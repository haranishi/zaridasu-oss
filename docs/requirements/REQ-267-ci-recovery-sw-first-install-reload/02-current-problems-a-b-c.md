## 現状の問題

### 問題A: 修正コミット2件が未push（edge-functions / test / rls-tests の赤の直接原因）

- ローカル: `77fdf65`（HEAD）→ `c2704e7` → `2e1539c`。リモート: `2e1539c` 止まり。
- `c2704e7` は `supabase/functions/deno.lock`（REQ-250 で追加した three/@react-three/fiber が Deno の npm 解決に波及した分を再生成）と `vitest.setup.ts`（`node:crypto` の webcrypto ポリフィル追加）の2ファイル、`77fdf65` は `supabase/tests/` 配下の pgTAP fixture 3ファイルのみを変更しており、いずれもコミットメッセージ上でローカル検証済み（`--frozen` 通過／48/48・7/7・21/21 緑）。
- push されない限り、リモートの3ジョブは何度再実行しても赤のまま。

### 問題B: e2e — SW 初回インストール時の無条件リロードと `page.content()` のレース

失敗テスト: `tests/e2e/error-boundary.spec.ts:4`「存在しない URL で 404 ページが日本語で表示される」

```
Error: page.content: Unable to retrieve content because the page is navigating and changing the content.
    at tests/e2e/error-boundary.spec.ts:8:27
```

メカニズム（コード実態に基づく因果連鎖）:

1. `public/sw.js`（生成元 `public/sw.js.tpl`）は install で `self.skipWaiting()`（18行目付近）、activate で `self.clients.claim()`（28行目付近）を呼ぶ。
2. `src/app/providers.tsx:61-77` の SW 登録ブロックは `controllerchange` に**無条件で** `window.location.reload()` を張っている:
   ```ts
   navigator.serviceWorker.addEventListener('controllerchange', () => {
     // 新しいSWが有効化されたら最新アセットを取得する
     window.location.reload()
   })
   ```
3. まっさらなブラウザプロファイル（Playwright は**テストごとに新規コンテキスト**）では、初回ページ表示 → SW 登録 → install（precache 4件）→ activate → `clients.claim()` の時点で「controller 無し → 有り」の `controllerchange` が**必ず発火**し、初回訪問ページが**必ず1回自動リロード**される。
4. 404テストは `page.goto()` 直後に `page.content()` を即時呼び出す（`error-boundary.spec.ts:8`）ため、このリロードと重なると「navigating」エラーで失敗する。リトライ（`retries: 1`）も新規コンテキスト＝初回インストールを再現するため同一条件で再失敗した。
5. `playwright.config.ts:10` の `maxFailures: process.env.CI ? 1 : undefined` により、1テストの失敗でスイート全体が中断（21 did not run）し、ジョブ全体が赤になる。

なお 2026-06-17 の CI（`2487e5b`）では同一テスト・同一 SW 実装で緑だった。緑→赤の間に three/@react-three/fiber 追加（REQ-250）等でクライアントバンドルが増え、ロードイベントと SW activate の相対タイミングが変わってレースが顕在化したと推定される（同一エラーで2回連続失敗＝現環境ではほぼ再現的）。

### 問題B-2（付随）: テストのアサーションが実質恒真

`error-boundary.spec.ts:9` の `expect(html).not.toMatch(/^Not Found$/i)` は、`page.content()` が返す**全HTML文字列**に対して `^...$` の完全一致否定を行っており、HTML全体が「Not Found」だけになることはあり得ないため**常に成功する**。テスト名の「日本語で表示される」を実際には検証していない。

### 問題C（付随・本番UX）: 実ユーザーの初回訪問でも同じ無条件リロードが発生

問題Bの構造は CI 固有ではなく、本番でも**新規訪問者全員**が初回表示直後に1回フルリロードされる（帯域浪費・表示ちらつき・入力途中データ消失リスク）。SW 更新配信のためのリロードは「既にSWにコントロールされていたページが新版に切り替わったとき」だけで十分であり、初回インストールでのリロードは不要。
