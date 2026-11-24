# REQ-297: CI静的検査の適用範囲拡張（Edge Function型ゲート・scripts/e2e・カバレッジ強制）

作成日: 2026-07-30
優先度: **P1** ／ 深刻度: **High**（問題A）〜Low ／ 種別: コード品質・CI
状態: **実装済み / CI実行確認待ち（AC-07）**
関連: REQ-281（CI・運用強化）, REQ-282（coverage/ の git 追跡除外）, REQ-287（service-role 集約。コミットに `--no-check` 未ゲートの自認あり）, REQ-117（Edge Function smoke test）, REQ-311（テスト不足の追加要件・本要件と対）

## これは何か

CI が「緑であること」ではなく「**緑の範囲が狭いこと**」を問題として扱う要件。
実効ゲートの外にあった 5 領域（Edge Function・`scripts/`・`tests/e2e/`・カバレッジ閾値・`.js` テスト）を
検査対象に取り込む。2026-07-31 に実装済みで、実装記録も本書に含む。

## 目的・背景（要約）

develop 89495e9 時点で type-check と lint はどちらも exit 0 だった。しかし本番の非同期基幹である
Edge Function 14 本、CI の門番スクリプト、e2e 33 件、カバレッジ閾値がいずれもゲートの外にあり、
実際に **Edge Function に型エラーが 1 件残存**していた（`notify-post-status/index.ts:143` の TS2538）。
「型チェックは別ジョブでカバー済み」という `ci.yml` のコメントは事実に反していた。

## 主要な決定事項（要点）

- 対象を広げた結果エラーが出るなら**それ自体が本要件の収穫**。除外に戻して緑にするのは**不達成**とみなす。
- `deno check` は `edge-functions` ジョブへ追加。**懸念だった `@types/node` 解決エラーは再現せず**、
  `npm ci` の追加は不採用。Deno 2.9.3 の `deno check` は `--cached-only` 非対応のため付けない
  （`deno test` 側では維持して CDN アクセスを遮断する）。
- 対象ファイルの収集は **glob ではなく `find` ＋件数チェック**にする。globstar 無効なシェルでは `**` が
  1階層に退化し、49 件中 **29 件**しかマッチしないまま静かに緑になるため。0 件なら `::error` で落とす。
- カバレッジ閾値は旧値 65/50/50/70 が**一度も CI から呼ばれていない飾り**だったので、実測ベースの
  **60/47/51/63 に置き直して初めて実効化**した（引き下げではない）。旧値は REQ-311 で回収する目標値とし、
  以後は下げない**ラチェット運用**とする。
- `.js` テスト 6 本は `.ts` 化して型検査対象に入れる（最終形は `.ts` 化）。
- e2e は `maxFailures` を CI で 1→5 に緩和し、失敗時に `playwright-report/` と `test-results/` を
  artifact 回収する。`workers: 1` / `fullyParallel: false` は本要件では変更しない。
- **AC-07 のみ未達**（実際に失敗させた CI から artifact を DL して trace を開く確認が残る）。他は全 AC 達成。

## 各部品

| ファイル | 内容 |
|---|---|
| [01-problem-a-edge-typecheck.md](REQ-297-ci-static-check-coverage/01-problem-a-edge-typecheck.md) | 背景と問題A（Edge Function に型ゲートが無く TS2538 が残存。`--no-check` が入った経緯も） |
| [02-problems-b-to-e.md](REQ-297-ci-static-check-coverage/02-problems-b-to-e.md) | 問題B（scripts/e2e が lint も tsc も未適用）〜E（e2e の打ち切りと trace 回収不可） |
| [03-requirements-acceptance-scope.md](REQ-297-ci-static-check-coverage/03-requirements-acceptance-scope.md) | 機能要件 FR-297-01〜05、受入基準 AC-01〜08、対象外、要確認 |
| [04-implementation-record.md](REQ-297-ci-static-check-coverage/04-implementation-record.md) | 実装記録（2026-07-31）の実装内容1〜5 |
| [05-notes-and-ac-status.md](REQ-297-ci-static-check-coverage/05-notes-and-ac-status.md) | `@types/node` 判断点の実測、閾値を置き直した理由、ゲート発火実証、AC 到達状況 |
