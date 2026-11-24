### 問題B: 補強のはずの Lighthouse CI がモバイルを計測していない — High

`.lighthouserc.json:9-11` の `settings` は `{"preset": "desktop"}` のみで、**モバイルスロットリング（低速 CPU・4G）での計測が一度も行われていない**。市民参加型の投稿マップという性質上、**主戦場はモバイル**であり、JS の実行時間コスト（TBT / TTI）はデスクトップ計測では過小評価される。

さらに `assert.assertions`（`:15-44`）では性能系がほぼ非ゲート化されている。

| 監査項目 | 現状 | 位置 |
|---|---|---|
| `categories:performance` | **warn**（minScore 0.8） | `:16` |
| `largest-contentful-paint` | **warn**（2500ms） | `:21` |
| `interactive` | **warn**（3500ms） | `:22` |
| `total-blocking-time` | **warn**（300ms） | `:23` |
| `unused-javascript` | **off** | `:41` |
| `uses-long-cache-ttl` | **off** | `:43` |
| `prioritize-lcp-image` | **off** | `:37` |
| `lcp-lazy-loaded` | **off** | `:35` |
| `cumulative-layout-shift` | error（0.1） | `:20` |
| `categories:accessibility` / `seo` | error（0.9） | `:17-18` |

`:2` の `_comment_performance` にあるとおり、performance スコアの error 化を降格したのは **GitHub Actions 共有 runner のノイズ（同一コミットで 0.73〜0.95 の振れ）を避けるため**であり、この判断自体（REQ-180）は妥当である。問題は「実性能は個別 warn と本番 Web Vitals で監視する」と書かれているのに、**その個別項目も全て warn** であり、かつ**モバイル計測が存在しない**ため、実質どの経路でも CI が性能退行を止められないことである。

計測対象 URL も `/`・`/trends`・`/about` の 3 本（`:7`）で、**/lp（広告着地・First Load JS の 56.3% がフレームワーク＋Sentry）と /dashboard（最重量 347.1 kB）が入っていない**。

### 総合すると

- **バンドルサイズ**: 実配信量の 97% が予算外。
- **実行時性能**: モバイル計測なし＋全 warn。
- したがって REQ-305 の問題A（+49.0 kB 常駐 SDK）・問題B（+16.5 kB zod 混入）はいずれも**「CI をグリーンで通過した状態」で本番に載っている**。これは個別の実装ミスではなく**計測ガバナンスの欠落**である。
