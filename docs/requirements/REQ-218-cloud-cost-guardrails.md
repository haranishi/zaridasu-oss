# REQ-218: クラウド課金ガードレール（コスト濫用・暴走防止）

## これは何か

正常な利用増・実装事故・bot / 鍵漏えいのいずれでも従量課金が伸びる構造に対し、**予算アラート・使用量監視・段階的 kill switch・暴走しないリトライ設計**を運用とコードの両面で整える要件定義。本文は下記の部品ファイルに逐語のまま分割してある。

## 目的・背景の要約

ザリダスは画像/音声アップロード（Storage・Egress）、Gemini による AI 分析、地図タイル、Vercel 画像最適化と、従量課金の増幅点を多数抱える。Obsidian の 25_Cloud_Cost_Abuse_Defense と 18_Cloud_IAM_Billing_Guardrails を下敷きに、**「分離 → 認証制限 → 利用量制限 → 暴走防止 → 検知 → kill switch → 説明可能性」**の順で多層に防ぐ。

現状は5つの穴がある。①予算・Spend Management・kill switch の設定形跡がリポジトリに無く、コスト資産は事後集計（`cost:ai` / `/admin/ai-cost`）だけで「使う前・最中に止める」手段が無い。②retry に backoff / jitter が皆無で、しかも `maxOutputTokens` を倍にするため 1 枚で `base*7` 相当の出力課金が起き得る。③AI 分析全体を止める機能フラグが無く、停止手段は手作業のみで手順も未文書化。④開発/本番の Supabase・Gemini 分離が不明。⑤コスト急増そのものを検知する経路と初動 runbook が無い。

## 主要な決定事項の要点

- **予算アラートはハード上限ではない**（設定額を超えても自動停止しない）という前提を全体の出発点にする。単一の防壁に頼らない。
- **「成功するまで再試行」を禁止する。** 指数バックオフ＋ジッタ、retry を含む1リクエスト全体の最大経過時間、最大試行回数の env 化を入れる。MAX_TOKENS 限定 retry／SAFETY・認証・入力不正は即 throw という現行方針は維持する。
- **新たな自動再投入ループを追加しない。** retry を使い切った失敗は `ai_failure_count` 加算＋`ai_call_logs` に error 記録で打ち切り、手動レビュー（DLQ 相当）へ退避する。
- **キーを失効させずに AI 分析だけ止められるフラグ**（`AI_ANALYSIS_ENABLED`、既定 `true`）を用意し、`false` なら Gemini を呼ばず `skipped: disabled` を返す。投稿自体は保存され手動レビューへ回る。
- **既定値は現行動作と等価にする。** フラグ・retry 上限のデフォルトを現状値に合わせ、既存テスト（dedup / rate limit / webhook secret / MAX_TOKENS retry）を壊さない。
- **フェイルセーフは安全側に倒す。** 停止・打ち切り・サイズ超過は自動承認せず手動レビューへ。フェイルオープンにしない。
- **billing 無効化は自動化しない。** 破壊的・復旧不能の可能性があるため、専用プロジェクト＋バックアップ前提の**手動最終手段**として手順化のみ。
- **境界**: 入口の bot 対策は REQ-212、AI 出力検証と送信前サイズ上限は REQ-215、鍵失効通知は REQ-126（実装済み）、インシデント runbook 全般は REQ-220 が主管。本 REQ は重複実装せず運用・設定・フラグ側を定義する。

## 各部品

| ファイル | 内容 |
|---|---|
| [01-background-and-boundaries.md](REQ-218-cloud-cost-guardrails/01-background-and-boundaries.md) | 背景（課金増幅点・下敷きの Obsidian 2ノート・多層防御の順序）と、隣接 REQ との境界（重複回避） |
| [02-current-problems.md](REQ-218-cloud-cost-guardrails/02-current-problems.md) | 現状の問題1〜5（予算/監視の不在・リトライの課金増幅・kill switch 不在・開発/本番分離不明・検知と初動 runbook の未整備）をファイルパス:行番号つきで |
| [03-goals-and-requirements.md](REQ-218-cloud-cost-guardrails/03-goals-and-requirements.md) | 目的5点と、機能要件 FR-218-01〜08（リトライ暴走防止・冪等性/失敗退避・kill switch フラグ・段階的停止手順6段・予算運用・異常検知・開発本番分離・サイズ上限の参照）、非機能要件 NFR-218-01〜05 |
| [04-acceptance-impact-and-priority.md](REQ-218-cloud-cost-guardrails/04-acceptance-impact-and-priority.md) | 受入条件 AC-01〜09、影響範囲（コード・env・ドキュメント・ダッシュボード設定）、優先度と理由（テールリスク） |
