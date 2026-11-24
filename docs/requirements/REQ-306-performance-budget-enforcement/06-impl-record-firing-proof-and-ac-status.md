### 発火実証

各破壊テストは一箇所だけ変更して実行し、結果確認後に正規値へ戻した。

| 何を壊したか | 期待 | 実際の exit code と検知メッセージ |
|---|---|---|
| 正常状態で `npm run build` 後に `npm run size:routes` | 全チェック成功 | exit 0。`OK: すべてのルート予算・共有チャンク予算・size-limit エントリの検査に合格しました。` |
| `ROUTE_BUDGETS` の `/dashboard` を 375 kB から 1 kB へ一時変更 | CHECK 1 がルート名付きで失敗 | exit 1。`ルート /dashboard の First Load JS が予算超過: 355.5 kB > 1.0 kB` |
| `SHARED_CHUNK_BUDGET` を 220 kB から 200 kB へ一時変更 | CHECK 2 だけが失敗 | exit 1。CHECK 1 と CHECK 3 は全件 ok、`共有チャンク合計が予算超過: 206.3 kB > 200.0 kB` |
| `/trends` の path を `page-DOES-NOT-EXIST-*.js` へ一時変更 | CHECK 3 が対象 0 件を検知 | exit 1。`.size-limit.json の "/trends page chunk (gzip)" が 1 件もファイルにマッチしていません` |
| 新規 `/dashboard` エントリの limit を 24 kB から 1 kB へ一時変更し `npm run size` | size-limit が失敗 | exit 1。`Package size limit has exceeded by 19.24 kB`、`Size: 20.24 kB gzipped` |

### 受入基準の状況

| AC | 状況 | 根拠・残作業 |
|---|---|---|
| AC-01 | 満たした | 7 ルートの First Load JS 全量を表示・ゲートし、監視カバー率 100% を確認した。 |
| AC-02 | 満たした | ルート予算と共有チャンク予算を個別に下げ、両ゲートが exit 1 で退行を止めることを実証した。 |
| AC-03 | 満たした | `/dashboard` と `/ranking` が `npm run size` に列挙され、CHECK 3 の対象 0 件検知も実証した。 |
| AC-04 | 未実施 | LHCI モバイル計測と mobile TBT の error 化は本タスクの範囲外。別タスクで実施する。 |
| AC-05 | 未実施 | LHCI の `/lp`・`/dashboard` 計測追加と実行時間確認は本タスクの範囲外。別タスクで実施する。 |
| AC-06 | 満たした | 追加した閾値の name に REQ-306、実測値、日付 2026-07-31 を記録した。 |
| AC-07 | 満たした | 新規エントリを含む `npm run size` が exit 0 で通る。 |
| AC-08 | 満たした | build・lint・type-check が通過し、現行の 87 files・789 tests もすべて通過した。 |
