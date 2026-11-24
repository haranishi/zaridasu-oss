# REQ-180: CI 品質ゲートの欠陥（デプロイ依存・Lighthouse 不発・並行制御欠如・size-limit 未カバー）

## 背景

ザリダスの CI（`.github/workflows/ci.yml`）は `test` / `e2e` / `perf-budget` / `edge-functions` / `edge-functions-deploy-lag` / `rls-tests` / `schema-drift` / `deploy` の 8 ジョブで構成される。各ジョブは個別には機能しているが、**ジョブ間の依存関係と並行制御が不十分**で、品質ゲートとして本来あるべき「失敗したら本番に出さない」「リグレッションをブロックする」が成立していない箇所が複数ある。

REQ-109 で Lighthouse のアサーションを `warn` から `error` へ格上げし（`.lighthouserc.json`）、REQ-176 で LP のバンドル肥大を監視する NFR を定めたが、いずれも CI 構成側の不備により実効化されていない。本 REQ は CI の品質ゲート 4 点をまとめて是正する。

## 現状の問題

（ファイルパス:行番号つき）

### (1) `deploy` が `needs: test` のみ ― RLS/E2E が落ちても本番デプロイされる
- `.github/workflows/ci.yml:274-276`：
  ```yaml
  deploy:
    needs: test
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
  ```
- `deploy` は `test` ジョブの成功だけを条件にしており、`e2e`（`ci.yml:32-49`）・`rls-tests`（`ci.yml:148-216`）・`edge-functions`（`ci.yml:73-106`）が**失敗していても main への push で本番（Vercel）デプロイが走る**。
- すなわち RLS ポリシーの回帰（pgTAP 失敗）や E2E 破綻がそのまま本番に出る。品質ゲートとして致命的。

### (2) Lighthouse CI が `continue-on-error: true` で一切ブロックしない
- `.github/workflows/ci.yml:69-71`：
  ```yaml
  - name: Run Lighthouse CI
    run: npx --yes @lhci/cli@0.14 autorun
    continue-on-error: true
  ```
- `.lighthouserc.json:13-16` では REQ-109 によりアサーションが `error` に格上げ済み（`categories:performance` minScore 0.85、`categories:accessibility` 0.9、`categories:seo` 0.9、`cumulative-layout-shift` maxNumericValue 0.1 がいずれも `["error", ...]`）。
- しかし `continue-on-error: true` のため、Lighthouse がアサーション違反で**非ゼロ終了してもステップが失敗扱いにならず**、`perf-budget` ジョブはグリーンになる。結果 **REQ-109 AC-05（パフォーマンス/a11y/SEO 劣化を CI でブロックする）が構造的に達成不能**。

### (3) CI 全体に concurrency 制御・timeout・Playwright キャッシュが無い
- `ci.yml` の先頭（`ci.yml:1-8`）に `concurrency:` 指定が無い。連続 push のたびに 8 ジョブ（実質 7+deploy）が**多重起動**し、古い実行がキャンセルされず Runner を浪費する。
- 各ジョブに `timeout-minutes` 指定が無い（`ci.yml` 全体に該当キーなし）。GitHub Actions の既定ジョブタイムアウトは 360 分のため、`e2e` や `rls-tests` がハングすると最大 6 時間 Runner を占有しうる。
- `e2e` ジョブの Playwright ブラウザ取得（`ci.yml:47-48` の `npx playwright install --with-deps chromium`）に**キャッシュが無い**ため、毎回フルダウンロードで遅い（`~/.cache/ms-playwright` を `actions/cache` していない）。

### (4) `.size-limit.json` に `/lp` チャンクのエントリが無い
- `.size-limit.json` のエントリは `/admin/posts`・`/(home)`・`/trends`・`Framework+React` の 4 件のみ（`.size-limit.json:1-26`）。`app/lp` のエントリは存在しない（`grep 'lp' .size-limit.json` が 0 件）。
- REQ-176 で `/lp`（`src/app/lp/page.tsx` は実在）が新設され、**NFR-176-01「Leaflet・地図関連・i18next 等の重量チャンクを LP バンドルに含めない」**を定めたが、size-limit に LP エントリが無いため `perf-budget` ジョブ（`ci.yml:67-68` の `npm run size` = `size-limit`）で継続監視できない。LP に重量ライブラリが混入しても検知されない。

## 目的

CI を「品質ゲートとして失敗時に本番を止め、パフォーマンス/RLS/E2E の回帰をブロックし、無駄な多重実行とハングを防ぎ、LP のバンドル肥大を監視する」状態にする。REQ-109・REQ-176 が前提とした CI の実効性を回復する。

## 要件

### 機能要件

- [ ] FR-180-01: `deploy` ジョブの `needs` を拡大し、品質ゲートとなるジョブの成功を本番デプロイの前提にする。最低限 `test` / `e2e` / `rls-tests` を含める（`.github/workflows/ci.yml:275`）。`edge-functions` / `schema-drift` も含めることを推奨。`perf-budget` の扱いは**任意**とし、ブロッキングにするか否かを本 REQ 内で判断のうえ明記する（FR-180-02 で perf-budget 自体は実効化するが、deploy をそこに依存させるかは別判断）。`edge-functions-deploy-lag` は main で warning/error の二段構えのため `needs` に含めるかは任意。
- [ ] FR-180-02: `perf-budget` ジョブの Lighthouse ステップから `continue-on-error: true` を撤去する（`.github/workflows/ci.yml:71`）。これにより `.lighthouserc.json` の `error` アサーション違反で CI が fail する。撤去にあたり、現状の本番ページが各アサーション（`.lighthouserc.json:13-16`）を満たすかを一度実測し、満たさない場合は (a) 該当アサーションのしきい値を現実的な値へ調整、または (b) 一時的に当該項目のみ `warn` へ戻す、のいずれを採るかを判断・記録する（ゲート自体は有効化したまま、無関係な恒常 fail を避ける）。
- [ ] FR-180-03: ワークフロー先頭に concurrency 制御を追加する（`.github/workflows/ci.yml:8` 付近、`jobs:` の前）：
  ```yaml
  concurrency:
    group: ci-${{ github.ref }}
    cancel-in-progress: true
  ```
  これにより同一 ref への連続 push で古い実行がキャンセルされる。
- [ ] FR-180-04: 各ジョブに `timeout-minutes` を設定する。目安: `test` / `e2e` / `rls-tests` は 20–30 分、軽量ジョブ（`schema-drift` / `edge-functions` / `edge-functions-deploy-lag` / `perf-budget`）は 15 分程度。ハング時に 360 分占有しないようにする。
- [ ] FR-180-05: `e2e` ジョブに Playwright ブラウザのキャッシュを追加する。`actions/cache` で `~/.cache/ms-playwright` を Playwright バージョン（`package-lock.json` の `@playwright/test` 版数）をキーにキャッシュし、`npx playwright install --with-deps chromium`（`ci.yml:47-48`）の所要時間を短縮する。キャッシュヒット時も `--with-deps` の OS 依存パッケージ導入は必要に応じて実行されるよう構成する。
- [ ] FR-180-06: `.size-limit.json` に `/lp` チャンクのエントリを追加する。既存エントリ（`.size-limit.json:8-13` の `/(home)` 等）に倣い、`path` を `.next/static/chunks/app/lp/page-*.js`、`gzip: true`、`limit` は LP の想定サイズに基づく現実的な上限（例: 重量ライブラリ非混入前提の小さめの値）で設定する。`limit` の初期値は最初の `npm run size` 実測値を基に決め、NFR-176-01 の「重量チャンク非混入」を検知できる水準にする。

### 非機能要件

- [ ] NFR-180-01: 上記変更後も CI 全体の通常実行時間が現状から大きく悪化しないこと（FR-180-05 のキャッシュで e2e はむしろ短縮が期待される）。
- [ ] NFR-180-02: `deploy` の `needs` 拡大により、PR ではなく main push 時のデプロイ条件（`if: github.event_name == 'push' && github.ref == 'refs/heads/main'`、`ci.yml:276`）は維持し、PR で誤ってデプロイが走らないこと。

## 受入条件

- [ ] AC-01: `rls-tests`（または `e2e`）を意図的に失敗させた状態で main 相当のイベントを流すと、`deploy` ジョブが `needs` 不成立でスキップ/失敗し、Vercel デプロイステップ（`ci.yml:288-292`）が実行されない。
- [ ] AC-02: `.lighthouserc.json` の `error` アサーションに違反する変更を入れると、`perf-budget` ジョブが fail する（`continue-on-error` が無いため）。逆に基準を満たす場合はパスする。
- [ ] AC-03: ワークフローに `concurrency.group: ci-${{ github.ref }}` と `cancel-in-progress: true` が存在し、同一ブランチへ短時間に 2 回 push すると先行実行がキャンセルされる。
- [ ] AC-04: すべてのジョブに `timeout-minutes` が設定されている（`grep -c 'timeout-minutes' .github/workflows/ci.yml` がジョブ数と一致）。
- [ ] AC-05: `e2e` ジョブに `~/.cache/ms-playwright` を対象とした `actions/cache` ステップが存在し、2 回目以降の実行でキャッシュヒットのログが出る。
- [ ] AC-06: `.size-limit.json` に `app/lp` を対象とするエントリが存在し、`npm run size` が LP チャンクを計測対象に含める。LP に Leaflet 等の重量チャンクを混入させた場合に `npm run size` が fail することを確認する。

## 影響範囲

**変更対象ファイル:**
- `.github/workflows/ci.yml`（concurrency 追加、`deploy.needs` 拡大、Lighthouse の `continue-on-error` 撤去、全ジョブ `timeout-minutes`、`e2e` の Playwright キャッシュ）
- `.size-limit.json`（`/lp` エントリ追加）
- `.lighthouserc.json`（FR-180-02 で恒常 fail 回避のためしきい値調整を選ぶ場合のみ）

**他機能への影響:**
- デプロイパイプライン（品質ゲート強化により、回帰時は本番反映が止まる＝意図どおり）。
- REQ-109（Lighthouse ゲート）と REQ-176（LP バンドル監視）の実効化。
- 開発体験（CI の多重実行抑制とキャッシュで Runner 効率改善）。
- アプリ本体のコードには影響なし（CI/監視構成のみ）。

## 優先度
- **緊急度**: High / **重要度**: High
- **理由**: (1) は「テスト以外の品質ジョブが落ちても本番に出る」という品質ゲートの根本的な穴で、RLS 回帰の本番流出に直結する。(2) は REQ-109 で格上げした Lighthouse ゲートを構造的に無効化している。(3)(4) は運用効率と REQ-176 の監視欠落。いずれも YAML/JSON 設定の変更が中心で、アプリ本体への影響なく低リスクに是正できる。
