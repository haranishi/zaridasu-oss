# REQ-128: Edge Function の secret 更新を確実に反映させる運用 + 検知機構

## これは何か

`supabase secrets set` だけでは本番 Edge Function に新しい secret が反映されない問題に対して、反映を保証する運用・検知・自動化を定義した要件。全文は同名ディレクトリの部品ファイルへ逐語で分割してある（入口のみ新規要約）。

## 目的・背景の要約

2026-05-12 の運用で `GEMINI_API_KEY` を更新したのに本番 Edge Function が古いキーを返し続け、Gemini API から `API key not valid (400)` を受け取り続ける障害が 1 時間以上発生した。原因は Edge Function のコンテナ env がプロセス起動時のスナップショットで、`Deno.env.get()` を lazy にしても古い値を返すこと。復旧には `supabase functions deploy` による再デプロイが必要だった。本要件は (1) secret 更新が必ず反映される仕組み、(2) 未反映状態の検知と管理者通知、(3) 属人運用の排除（CI / 自動化）を目的とする。

## 主要な決定事項の要点

- `health-gemini` に `started_at` と `secret_prefix`（8 文字・admin のみ）を追加し、「secret は新しいが function は古いキーで動いている」状態を運用者が判別できるようにする。
- runbook（`gemini-key-rotation.md` / `edge-function-deploy.md`）へ redeploy 必須セクションを追加する。手順書だけで復旧が完結することを受入条件にする。
- CI に `secret-deploy-sync` ジョブを追加し、secret 変更後に未再デプロイの function があれば warning / error を出す。`scripts/secret-function-map.json` で secret と function の対応を管理し、スキーマをテストで検証する。
- `workflow_dispatch` で起動する `redeploy-on-secret-change.yml` を新設し、対象 4 function をまとめて再デプロイする。
- 優先度は緊急度 High / 重要度 High。Phase 1 は runbook 更新（FR-128-05・06）、Phase 2 は検知強化（FR-128-01〜04）、Phase 3 は CI 検知と自動 redeploy（FR-128-07・08・12）、Phase 4 は任意のコード堅牢化（FR-128-09・10）。

## 部品ファイル

| ファイル | 内容 |
|---|---|
| [01-background-and-problems.md](REQ-128-edge-function-secret-refresh/01-background-and-problems.md) | 背景（2026-05-12 の障害と 4 つの核心）と現状の問題（実装・運用・再現/観測） |
| [02-goal-and-functional-requirements.md](REQ-128-edge-function-secret-refresh/02-goal-and-functional-requirements.md) | 目的、機能要件 A〜E（health-gemini 検知・UI 連携・運用ドキュメント・CI / 自動化・コード堅牢化） |
| [03-nfr-and-tests.md](REQ-128-edge-function-secret-refresh/03-nfr-and-tests.md) | 非機能要件（NFR-128-01〜03）とテスト要件（FR-128-11〜13） |
| [04-acceptance-impact-priority.md](REQ-128-edge-function-secret-refresh/04-acceptance-impact-priority.md) | 受入条件 AC-128-01〜06、影響範囲（変更対象ファイル・他機能への影響）、優先度と Phase 分け |
