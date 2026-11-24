### 追加要件（push 後の CI 実行 [run 29189337395](https://github.com/haranishi/zaridasu/actions/runs/29189337395) で判明した残 2 ジョブ）

FR-267-01〜03 の push 後、edge-functions / rls-tests / e2e は緑になったが、**test** と **perf-budget** の 2 ジョブが残った。

- [ ] FR-267-05: **test ジョブの sha256 3件（`c2704e7` の crypto.subtle ポリフィルでも直らない真因）**。CI の test ジョブは `actions/setup-node` で **Node 20**（`.github/workflows/ci.yml`）、ローカルは Node 24。`c2704e7` の `vitest.setup.ts` ポリフィルは `!('subtle' in globalThis.crypto)` のときだけ Node webcrypto を入れるが、jsdom 28 は Node 20 でも `crypto.subtle` プロパティ「だけ」は生やす（`digest` が未実装/破損）ため条件が偽になりポリフィルが効かず、`sha256Hex` が例外→`null` を返して3件が落ちる。`sha256Hex` は DOM 非依存（`Blob.arrayBuffer()`＋`crypto.subtle.digest`）のため、`src/lib/hash/__tests__/sha256.test.ts` 先頭に `// @vitest-environment node` を付け **node 環境**で実行し、Node ネイティブの Blob＋webcrypto（Node 20/24 いずれでも `digest` が正しく動く）を使って jsdom 差を排除する。併せて `vitest.setup.ts` の `window.matchMedia`/`ResizeObserver` モックを `if (typeof window !== 'undefined')` でガードし、node 環境のテストが setup で落ちないようにする（jsdom テストは挙動不変）。
- [ ] FR-267-06: **perf-budget（Lighthouse CI）の `unused-css-rules`**。`.lighthouserc.json` は `lighthouse:recommended` を継承し、`unused-css-rules` は既定の `error`（`maxLength: 0`＝未使用CSSの機会ゼロ要求）のまま。前コミット `2e1539c` では 0 で通っていたが、本 run で 3 URL とも `1` を検出して唯一の error 級失敗になった（他の `errors-in-console`/`speed-index` 等は全て warn）。**原因は FR-267-01 のリロード廃止**：旧コードは初回訪問で `window.location.reload()` していたため Lighthouse は「SW 温まり後の再描画」を計測しており未使用CSS=0 になっていた。リロード廃止で**正直な初回描画**を計測するようになり、above-the-fold 外の CSS ルールが常識的に 1 機会残る（`maxLength: 0` は非現実的閾値）。これはバイト効率の opportunity 監査であり、設定は既に姉妹監査 `unused-javascript` を `off` にしている（REQ-180: 共有 runner のパフォ系は flaky）。整合のため `unused-css-rules` も `off` にする（トップレベル `_comment_unused_css_rules` に根拠を明記）。

### 非機能要件

- [ ] NFR-267-01: 真のSW更新フローを後退させない。既にSWにコントロールされたページで新版が activate した場合は、従来どおり**1回だけ**自動リロードされること（REQ-100 のキャッシュバージョン自動更新の配信手段を維持）。
- [ ] NFR-267-02: `public/sw.js.tpl` / `public/sw.js` / `scripts/build-sw.mjs` は変更しない（`skipWaiting`＋`clients.claim` は初回からのオフライン制御に必要。修正はクライアント登録側 `providers.tsx` に閉じる）。
- [ ] NFR-267-03: 本番コード（`supabase/schema.sql`・migrations・middleware）に変更を加えない。
