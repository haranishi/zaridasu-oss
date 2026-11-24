# REQ-098: バンドル分析の常設（@next/bundle-analyzer）

> 親 REQ: REQ-092（Web アプリ軽量化包括要件）

## 背景
ザリダスはバンドルサイズの「現状値」を `size-limit` で監視している（REQ-062）が、**何が重いのか** を可視化する仕組みが無い。

依存追加 / dynamic import 漏れがあったとき、CI で size-limit が落ちても、原因チャンクが何かはローカルで再ビルドして手作業で調べるしかない。`@next/bundle-analyzer` を導入すると、`ANALYZE=true npm run build` で treemap HTML が出て、開発者がモジュール単位で重量を確認できる。

## 現状の問題
- `package.json` に `@next/bundle-analyzer` 無し
- `next.config.ts` に bundle-analyzer ラップ無し
- リグレッションが起きたとき犯人モジュールの特定に時間がかかる
- REQ-093（tree-shaking）/ REQ-096（RSC 化）の効果証明が定量化しにくい

## 目的
ローカル開発時にバンドル treemap を生成可能にし、size-limit / Lighthouse でリグレッションが出たときに即原因特定できるようにする。CI には含めず、開発者の手元で常時使える状態にする。

## 要件

### 機能要件
- [ ] FR-098-01: `@next/bundle-analyzer` を devDependency に追加する（`@next/bundle-analyzer@^15`）。
- [ ] FR-098-02: `next.config.ts` を `withBundleAnalyzer` でラップする。`process.env.ANALYZE === 'true'` のときのみ有効。
- [ ] FR-098-03: `package.json` の scripts に `analyze` を追加する：
  ```json
  "analyze": "ANALYZE=true next build"
  ```
- [ ] FR-098-04: 生成される `client.html` / `server.html` / `edge.html` を `.gitignore` に登録する（`.next/analyze/**`）。
- [ ] FR-098-05: `docs/runbooks/bundle-analysis.md`（新規）に使い方を記録：
  - 実行コマンド
  - 重量上位の見方
  - First Load JS と Shared Chunks の区別
  - dynamic import が効いているかの確認方法

### 非機能要件
- [ ] NFR-098-01: `ANALYZE=true` 未指定時に bundle-analyzer の処理が走らないこと（通常ビルド時間に影響しない）。
- [ ] NFR-098-02: CI（`.github/workflows/ci.yml`）に追加コストが発生しないこと（CI ジョブを増やさない）。

## 受入条件
- [ ] AC-01: `package.json` の devDependencies に `@next/bundle-analyzer` が含まれる。
- [ ] AC-02: `npm run analyze` 実行で `.next/analyze/client.html` が生成される。
- [ ] AC-03: `npm run build`（ANALYZE 未指定）の所要時間が現状から増えていない（±10% 以内）。
- [ ] AC-04: `.gitignore` に `.next/analyze/` が含まれる。
- [ ] AC-05: `docs/runbooks/bundle-analysis.md` が存在し、新規開発者が読んで treemap を解釈できる。
- [ ] AC-06: 生成された treemap で、`/`, `/admin/posts`, `/trends` の First Load JS の内訳が確認できる。

## 影響範囲
- `package.json`
- `next.config.ts`
- `.gitignore`
- `docs/runbooks/bundle-analysis.md`（新規）

## 優先度
- **緊急度**: High（REQ-092 の P0）
- **重要度**: High
- **理由**: REQ-092 の他施策（REQ-093 / 096 等）の効果証明と原因特定に必須。`size-limit` だけでは「何が重いか」が分からない。実装コストは XS（30 分）。

## 実装メモ

### `next.config.ts` 統合例
```ts
import bundleAnalyzer from '@next/bundle-analyzer'

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
})

const nextConfig: NextConfig = {
  // 既存の設定...
}

export default withBundleAnalyzer(nextConfig)
```

### 生成されるレポート
- `client.html`: ブラウザに送られる JS（最も重要）
- `server.html`: SSR で実行される JS
- `edge.html`: Edge Runtime（middleware 等）

### 解釈の指針
- `client.html` のサイズ Top 10 → 削減対象候補
- `chunks/app/(home)/page-*.js` がホームの First Load JS
- node_modules の中で 30KB を超える依存があれば dynamic 化検討
- `framework-*.js` は React / Next.js 本体（触れない）

### 補完
- `next build` のターミナル出力（Route 別 First Load JS テーブル）も併用すると、ルート単位の状況把握が早い。
