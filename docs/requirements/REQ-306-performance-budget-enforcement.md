# REQ-306: 性能予算の実効化（size-limit の監視範囲と Lighthouse CI のモバイル計測）

作成日: 2026-07-30
優先度: **P1** ／ 深刻度: **High** ／ 種別: 性能（計測ガバナンス）
状態: **実装済み（2026-07-31）**。バンドル予算ゲート・LHCI モバイル計測とも完了し、いずれも発火実証済み。残は AC-05 の CI 実行時間の実測のみ
関連: REQ-278（フロントエンド性能改善）, REQ-213（perf-budget / NFR-213-01）, REQ-180（LHCI で performance を warn へ降格した判断）, REQ-250（crayfish3d の予算）, REQ-267（unused-css-rules を off にした判断）, REQ-281（size-limit 予算追加の記録）, REQ-305（初期バンドルの削減＝**本REQの後に実施する**）

> [!important] 本REQは REQ-305 より先に入れる
> REQ-305（Sentry 49.0 kB・zod 16.5 kB 等の削減）を先に実施しても、**現行 CI では削減が戻ったときに検知できない**。
> 「削る」より先に「守る枠を作る」。本REQは前提整備であり、単独でも価値がある（以降の全ての退行を検知可能にする）。

## これは何か

「削る」より先に「守る枠を作る」ための計測ガバナンス要件。size-limit がルート固有チャンクしか見て
いないため実配信量の約 3% しかゲートできておらず、Lighthouse CI もデスクトップのみ・性能系は全 warn
だった。ルート単位の First Load JS 合計を決定論的にゲートし、LHCI にモバイル計測を足す。

## 主要な決定事項の要点

- **主ゲートは「ルート単位の First Load JS 合計」**（`.next/app-build-manifest.json` の各ルートの
  ファイルを gzip して合算）。`npm run size:routes` として新設し、CI で PR をブロックする。
- **共有チャンクの個別エントリは補助にとどめる**。webpack の採番（`9898` 等）はモジュール構成が
  変わると変動し、glob が「対象 0 件」でも size-limit は静かに通過するため。
  → 実装では**採番付き glob を採用せず**、7 ルートのマニフェストから共通チャンクを毎回導出する
  CHECK 2 に置き換えた（FR-306-03 の代替実装）。
- **閾値は「実測＋ヘッドルーム」**。根拠となる実測値と日付をコメントで必ず残す。
- **🔴 mobile TBT の error 化は成立しないと実測で判明 → warn に変更**。同一コードで CI 実行ごとに
  868〜2213 ms（2.5倍）振れるため、検知したい差（+49 kB ＝数百 ms 規模）がノイズに埋もれる。
  REQ-180 が `categories:performance` を warn へ降格したのと同じ理由・同じ種類の問題。
  **バイト数の退行検知は決定論的な `size:routes` が担う**ので退行は素通りしない。
- **`/dashboard` は LHCI の計測対象にしない**（FR-306-06 からの意図的な逸脱）。未認証の LHCI では
  `/` へ置換される空ページしか測れないため。JS 重量は CHECK 1 が既にゲート済み。
- **`/lp` を計測対象から外して緑にする選択は採らなかった**。退行検知そのものが消えるため。
  代わりに `assertMatrix` で URL 単位に限定降格した。
- **REQ-305（実際のバンドル削減）より先に入れる**。削減が戻ったときに検知できる枠を先に作る。

## 状態（2026-07-31）

バンドル予算ゲート・LHCI モバイル計測とも実装済みで、いずれも発火実証済み。
AC-01/02/03/06/07/08 は充足、AC-04 は要件を修正して充足（mobile TBT は warn）、
AC-05 は充足したが **`perf-budget` ジョブの余裕は最短で約3分54秒**しかない。
今後 URL や `numberOfRuns` を増やすときは必ず `timeout-minutes` を先に引き上げること。

## 目次（各部品）

- [01-background-and-problem-a-size-limit-coverage.md](REQ-306-performance-budget-enforcement/01-background-and-problem-a-size-limit-coverage.md)
  — 背景（ルート別 First Load JS とカバー率の実測表、予算外の共有チャンク一覧）と問題A（予算が実配信量の約 3% しか見ていない／共有チャンク個別エントリの落とし穴）。
- [02-problem-b-lighthouse-mobile-and-summary.md](REQ-306-performance-budget-enforcement/02-problem-b-lighthouse-mobile-and-summary.md)
  — 問題B（LHCI がモバイルを計測しておらず性能系がほぼ非ゲート／監査項目の現状表）と「総合すると」。
- [03-functional-requirements.md](REQ-306-performance-budget-enforcement/03-functional-requirements.md)
  — 機能要件 FR-306-01〜08（ルート合算ゲート、初期閾値表、共有チャンクエントリ、/dashboard・/ranking 追加、mobile preset、計測 URL 追加、CI 接続、REQ-305 後の締め直し）。
- [04-acceptance-criteria-and-out-of-scope.md](REQ-306-performance-budget-enforcement/04-acceptance-criteria-and-out-of-scope.md)
  — 受入基準 AC-01〜08 と対象外（REQ-305 本体、`categories:performance` の error 化、off にした監査の再有効化、RUM ダッシュボード）。
- [05-impl-record-and-measurements.md](REQ-306-performance-budget-enforcement/05-impl-record-and-measurements.md)
  — 実装記録：実装内容、FR-306-03 の代替実装（採番依存を捨てた理由）、2026-07-31 の実測表（ルート予算・追加した size-limit エントリ）。
- [06-impl-record-firing-proof-and-ac-status.md](REQ-306-performance-budget-enforcement/06-impl-record-firing-proof-and-ac-status.md)
  — 破壊テストによる発火実証の結果表と、受入基準 AC-01〜08 の状況。
- [07-lhci-mobile-setup-and-tbt-finding.md](REQ-306-performance-budget-enforcement/07-lhci-mobile-setup-and-tbt-finding.md)
  — LHCI モバイル計測の実装内容（`preset: mobile` が使えない件・計測 URL の選定）、モバイル TBT の実測、CI 実測で error ゲートが成立しないと判明した経緯と教訓。
- [08-lhci-mobile-new-findings-and-ac-update.md](REQ-306-performance-budget-enforcement/08-lhci-mobile-new-findings-and-ac-update.md)
  — モバイル計測で顕在化した 2 件（`color-contrast` / `image-size-responsive`）と限定降格の判断、発火実証、受入基準の更新（AC-04 / AC-05）。
