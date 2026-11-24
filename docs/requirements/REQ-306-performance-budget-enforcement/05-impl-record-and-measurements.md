## 実装記録（2026-07-31）

### 実装内容

- `package.json` に `npm run size:routes` を登録し、`.github/workflows/ci.yml` の `perf-budget` ジョブで `npm run size` の直後に実行するよう配線した。
- `.size-limit.json` に `/dashboard` と `/ranking` のルート固有チャンクを追加した。2026-07-31 の gzip 実測に約 15% の余裕を持たせ、1 kB 単位で切り上げた。
- `scripts/check-bundle-budget.mjs` の CHECK 2 に、全対象ルートで共通するチャンクのファイル名と gzip サイズを大きい順で表示する内訳を追加した。
- 正常系に加え、CHECK 1・CHECK 2・CHECK 3・size-limit の各ゲートを意図的に壊し、実際に exit code 1 になることを確認した。

### FR-306-03 の代替実装

共有チャンクの採番付き glob を `.size-limit.json` に追加する方針は採用しなかった。`9898` などの番号は webpack がビルド時に割り当てるため、モジュール構成の変更で再採番される。固定番号の glob は再採番後に対象 0 件となり、保守のたびに path 更新が必要になる。

代わりに CHECK 2 が、7 ルートすべてのマニフェストを比較して共通チャンクを毎回導出し、その合計をゲートする。さらに今回、導出した各チャンクのファイル名と gzip サイズを大きい順に表示した。これにより採番へ依存せず、合計の退行検知と「どの共有チャンクが重いか」の可視化を両立した。

### 2026-07-31 実測

単位はすべて kB = 1000 バイト、gzip level 9。ルート値は `npm run size:routes`、ルート固有チャンク値は `npm run size` の結果である。

| ルート | First Load JS | ルート予算 |
|---|---:|---:|
| /dashboard | 355.5 kB | 375 kB |
| /collection | 343.5 kB | 365 kB |
| / | 340.6 kB | 360 kB |
| /post/[id] | 337.3 kB | 355 kB |
| /trends | 312.6 kB | 330 kB |
| /ranking | 312.5 kB | 330 kB |
| /lp | 219.4 kB | 235 kB |
| 全対象ルート共通チャンク合計 | 206.3 kB | 220 kB |

| 追加した size-limit エントリ | 実測 | limit | 根拠 |
|---|---:|---:|---|
| /dashboard page chunk | 20.237 kB | 24 kB | 実測 × 約 1.15 を 1 kB 単位で切り上げ |
| /ranking page chunk | 6.317 kB | 8 kB | 実測 × 約 1.15 を 1 kB 単位で切り上げ |
