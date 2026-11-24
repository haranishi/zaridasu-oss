# REQ-290〜315 実装 — 進捗と再開メモ

最終更新: **2026-08-03**（REQ-298 を実装。検査基盤の穴は FR-298-08 の PG17 統一を残すのみ）
対象: [REQ-290〜315 課題インデックス](REQ-290-315-audit-2026-07-30-index.md) の実装フェーズ

## これは何か

REQ-290〜315 監査の**実装フェーズの進捗台帳**であり、作業を中断・再開するための引き継ぎメモ。
どこまで実装が終わり、何が残り、再開時に何を踏むかを1か所に集約している。

## 目的・背景

2026-07-30 の監査で挙がった 106 件の課題に対し、26本の要件書を起こして実装を進めている。
実装は複数セッション・複数エージェントに分かれるため、**セッションをまたいで失われる文脈**
（作業ブランチ、健全性の実測値、環境固有の罠、判断待ち事項）をこのメモに残す。

## 主要な決定事項（要点）

- 変更はすべて **PR #31（base は `develop`・未マージ）** に載っている。再開時はまず
  `git switch feat/req-290-315-audit-implementation`。`main`・`develop` は未変更。
- 進捗は **実装済み11件 / 未着手13件 / 運用タスク2件**（290・291 はコードでは解決できない）。
- **完了の定義は「意図的に壊して赤くなることを実証したか」**。ゲートを足したら必ず非0終了を確認する。
- **本番未適用 migration が3本**あり、適用するまで main push で本番デプロイが走らない（意図どおり）。
- PR は今後**機能ごとに小さく分ける**（REQ-316 実装から）。PR #31 自体は分割しない。
- サブエージェントは **Codex 第一 / Opus 第二 / Fable はメインループ専用**。並列は「波」に分ける。

## 各部品

| ファイル | 内容 |
|---|---|
| [01-session-state.md](REQ-290-315-implementation-progress/01-session-state.md) | 2026-08-03 セッション末の状態と PR 運用方針（**最新・まずここ**） |
| [02-read-first.md](REQ-290-315-implementation-progress/02-read-first.md) | 最初に読むこと（PR #31 の在り処・コミット構成・健全性の実測表・エージェント運用・完了の定義） |
| [03-pitfalls.md](REQ-290-315-implementation-progress/03-pitfalls.md) | 再開時に踏みやすい罠（環境・ツール）の一覧表 |
| [04-progress-summary.md](REQ-290-315-implementation-progress/04-progress-summary.md) | 進捗サマリー表と 2026-07-31 に完了した3件（306 / 297 / 312）の要点 |
| [05-done-req292-294.md](REQ-290-315-implementation-progress/05-done-req292-294.md) | 実装済みの記録: REQ-292 / 293 / 294（＋実装済み分の読み方） |
| [06-done-req295-310.md](REQ-290-315-implementation-progress/06-done-req295-310.md) | 実装済みの記録: REQ-295 / 296 / 302 / 310 |
| [07-ops-only-tasks.md](REQ-290-315-implementation-progress/07-ops-only-tasks.md) | コードでは解決できない運用タスク（REQ-290 資格情報失効 / REQ-291 webhook認証） |
| [08-not-started.md](REQ-290-315-implementation-progress/08-not-started.md) | 未着手分の推奨実施順（REQ-316 / FR-298-08 / P1本体 / P2） |
| [09-decisions-needed.md](REQ-290-315-implementation-progress/09-decisions-needed.md) | 本人に判断してもらうこと（2026-08-03 新規4件＋継続2件） |
| [10-resume-commands.md](REQ-290-315-implementation-progress/10-resume-commands.md) | 再開時に打つコマンド一式 |

索引: [REQ-290-315-audit-2026-07-30-index.md](REQ-290-315-audit-2026-07-30-index.md)（106件の課題と観点別の発見・クリーン確認済み領域）
