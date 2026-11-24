# REQ-122: Playwright E2E が別アプリを誤テストしないようポート分離とスモークチェックを導入する

## 背景
ローカルで `npm run e2e` を実行した際、`localhost:3000` に**別のアプリ**が起動していた状態で、Playwright がそれを「ザリダス」だと思い込んでテストを走らせてしまう事故が実際に発生した。原因は `playwright.config.ts:26` の `reuseExistingServer: !process.env.CI` 設定で、ローカル（CI 外）では既存サーバーを再利用する挙動になっているため。

E2E が偽陽性／偽陰性を返す状態は品質ゲートとしての信頼性を失わせ、最悪「E2E が緑だから merge してよい」と判断した結果、本番でリグレッションを起こす。同じポートを別プロジェクトと共有することは Next.js 開発者の日常風景なので、構造的に分離する必要がある。

## 現状の問題

### 1. 既存サーバー再利用がデフォルトで有効
```ts
// playwright.config.ts:21-32
webServer: process.env.E2E_BASE_URL
  ? undefined
  : {
      command: 'npm run build && npm run start',
      url: 'http://localhost:3000',
      reuseExistingServer: !process.env.CI,  // ← ローカルでは true
      timeout: 180_000,
      env: { ... },
    },
```
ローカルで 3000 番に別アプリがいると、Playwright はそれを「再利用」してテスト対象にする。

### 2. 「テスト対象が本当にザリダスか」を確認するスモークが無い
`tests/e2e/` 配下の各 spec はいきなり機能テストに入っている。最初の 1 ステップで「ページタイトルに『ザリダス』を含む」「特定のロゴ／DOM が存在する」を確認していれば、誤対象テストは即座に失敗する。

### 3. ポート 3000 がアプリ専用と暗黙の前提
`baseURL` も `http://localhost:3000`（`playwright.config.ts:11`）。E2E 専用ポート（3100 等）に分離しておけば、開発中の `next dev` と E2E build server の競合も解消する。

## 目的
- E2E が「ザリダス以外のアプリ」を絶対にテストしない構造を作る。
- ローカルでも CI でも同じ起動戦略にして、再現性を高める。
- 開発中の `next dev` と E2E が並行して動かせるようにする。

## 要件

### 機能要件
- [ ] FR-122-01: `playwright.config.ts` で E2E 専用ポートを `3100` に固定する。`baseURL` を `http://localhost:3100` に、`webServer.url` を同じく `http://localhost:3100` に変更する。
- [ ] FR-122-02: `webServer.command` を `npm run build && npm run start -- -p 3100` に変更する（Next.js の `next start` は `-p` でポート指定可能）。
- [ ] FR-122-03: `reuseExistingServer` を `false` に固定する。`E2E_BASE_URL` が外部から指定されたときのみ、既存サーバー想定で `webServer: undefined` を維持する。
- [ ] FR-122-04: `tests/e2e/_smoke.spec.ts` を新規作成し、以下 1 ファイルで起動先がザリダスであることを最初に検証する：
  - ページタイトルに「ザリダス」を含む
  - `<html lang="ja">` を持つ
  - `<meta name="theme-color" content="#dc2626">` が存在
- [ ] FR-122-05: スモークが落ちたら以降の spec は実行しない（`fullyParallel: false` は維持されており、`_smoke.spec.ts` のファイル名がアルファベット順で先頭になる前提を活かすか、`globalSetup` で起動先検証する）。
- [ ] FR-122-06: README または `tests/e2e/README.md` に「E2E は 3100 番を使う」「`next dev` を 3000 番で並行起動して開発しながら E2E を回せる」と記載する。

### 非機能要件
- [ ] NFR-122-01: `npm run e2e` が CI（`process.env.CI=1`）でもローカルでも同じ挙動になる。
- [ ] NFR-122-02: スモークステップは 5 秒以内で完了し、E2E 全体の所要時間に大きな影響を与えない。

## 受入条件
- [ ] AC-01: `localhost:3000` で別アプリが動いている状態で `npm run e2e` を実行 → ザリダス（3100）が新規起動し、別アプリは無視される。
- [ ] AC-02: `localhost:3100` で他のものが動いている場合、Playwright が起動失敗で明確なエラーを返す（暗黙再利用しない）。
- [ ] AC-03: `tests/e2e/_smoke.spec.ts` 単独実行で「ザリダス」確認が pass する。
- [ ] AC-04: スモークを意図的に壊して別ポートに別アプリを向けると、`_smoke.spec.ts` が落ちて他の spec が走らない（fail-fast）。
- [ ] AC-05: CI（`.github/workflows/ci.yml`）で `npm run e2e` が緑のまま。

## 影響範囲
- 変更対象ファイル
  - `playwright.config.ts`
  - `tests/e2e/_smoke.spec.ts`（新規）
  - `tests/e2e/` 既存 spec（必要なら `baseURL` 依存箇所を確認）
  - `README.md`（E2E 章があれば追記）
  - `.github/workflows/ci.yml`（CI で 3100 を予約する必要があれば）
- 影響しないこと
  - アプリ本体の挙動。
  - dev 用ポート 3000（開発中はこれまで通り）。

## 優先度
- **緊急度**: High
- **重要度**: High
- **理由**: 「E2E が緑＝本番リリースして良い」というワークフローの根幹を支えるため。誤テスト事故が一度起きている時点で、構造的に直さないと再発する。修正は設定ファイル数行と新規 spec 1 本で済み、コストが軽い。
