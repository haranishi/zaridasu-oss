# REQ-109: Lighthouse CI 閾値の引き締め

> 親 REQ: REQ-092
> 関連 REQ: REQ-062（test-bundle-size-lighthouse）

## 背景
`.lighthouserc.json` の現状：

```json
"categories:performance": ["warn", { "minScore": 0.8 }],
"categories:accessibility": ["error", { "minScore": 0.9 }],
"categories:seo": ["warn", { "minScore": 0.9 }],
```

Performance は **warn（CI が落ちない）** + 0.8 と緩い。リグレッションが検出されても PR が通ってしまう。REQ-062 / REQ-092 で「実装後に閾値を引き締める」と宣言したが未実施。

REQ-022 / 026 / 093 / 098 等の軽量化バッチを完了したので、引き締めの段階。

## 現状の問題
- Performance が warn のため、Lighthouse スコアが 0.7 でも PR がマージできてしまう
- LCP / INP / CLS の数値アサートが無いので、合計スコアだけでは LCP 大幅悪化が見逃される
- Lighthouse CI 計測は desktop preset のみ。モバイルが見えない

## 目的
Lighthouse CI の閾値を実測値に合わせて引き締め、リグレッションを CI で blocking で検出する。

## 要件

### 機能要件
- [ ] FR-109-01: Performance を `["error", { "minScore": 0.85 }]` に格上げ
- [ ] FR-109-02: SEO を `["error", { "minScore": 0.9 }]` に格上げ
- [ ] FR-109-03: 個別メトリクスのアサートを追加：
  - `largest-contentful-paint`: `["warn", { "maxNumericValue": 2500 }]`
  - `cumulative-layout-shift`: `["error", { "maxNumericValue": 0.1 }]`
  - `interactive`: `["warn", { "maxNumericValue": 3500 }]`
  - `total-blocking-time`: `["warn", { "maxNumericValue": 300 }]`
- [ ] FR-109-04: モバイルプリセットで計測する追加ジョブを `.lighthouserc.mobile.json` として作成（任意）
- [ ] FR-109-05: `numberOfRuns` を 3 にして安定化（中央値で評価）

### 非機能要件
- [ ] NFR-109-01: 閾値引き締め後も現状ビルドの `/`, `/trends`, `/about` が pass すること
- [ ] NFR-109-02: CI 実行時間の増加が +2 分以内

## 受入条件
- [ ] AC-01: `.lighthouserc.json` で Performance / SEO / Accessibility の全カテゴリが `error` ステータス
- [ ] AC-02: LCP / CLS / TBT の数値アサートが含まれる
- [ ] AC-03: `numberOfRuns` が 3 以上
- [ ] AC-04: GitHub Actions の `perf-budget` ジョブが pass（現状値を回帰させない）
- [ ] AC-05: わざと重い import を入れた branch で CI が `error` で落ちる（手動確認）

## 影響範囲
- `.lighthouserc.json`
- `.github/workflows/ci.yml`（`continue-on-error: true` を外す候補 / モバイル計測の追加）

## 優先度
- **緊急度**: Medium
- **重要度**: Medium
- **理由**: 軽量化バッチの効果を恒常化する仕組み。1 ファイル変更（XS）。実装コストは低いが、必要な検証（既存の LH スコアが 0.85 を超えているか実測）にやや時間がかかる。

## 実装メモ
- まず CI で 1 回 Lighthouse を回し、現状スコアの中央値を確認してから閾値を決める
- ホームの LCP は地図描画があるため、`maxNumericValue` を緩めに設定（warn）するのが安全
- Accessibility は既に error 0.9 なので維持
- `csp-xss: off` / `uses-http2: off` / `unused-javascript: off` 等の現行 off 設定は維持（Vercel 構成で改善できない）
- `treosh/lighthouse-ci-action@v11` 経由なら `runs: 3` が標準オプションで指定可能
