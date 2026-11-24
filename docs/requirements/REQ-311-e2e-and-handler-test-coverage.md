# REQ-311: 主要フローのE2EとEdge Functionハンドラテストの追加

作成日: 2026-07-30
優先度: **P1** ／ 深刻度: **High** ／ 種別: テスト
状態: **提案 / 未実装**
関連: REQ-281（CI・運用強化）, REQ-234（ライフサイクル通知）, REQ-237（Web Push）, REQ-236（SNS 自動投稿）, REQ-117（Edge Function smoke test の初版）, REQ-110（e2e カバレッジ拡張）, REQ-280（通知の冪等性・未実装）, REQ-297（静的検査の適用範囲。e2e の artifact 化・maxFailures はそちら）

## これは何か

CI のチェック本数は多いのに、アプリの中核フロー（投稿 → 審査 → 公開）と外部送信の副作用を持つ Edge Function だけがテスト空白になっている問題を埋める要件。全文は同名ディレクトリの部品ファイルへ逐語で分割してある（入口のみ新規要約）。

## 目的・背景の要約

`tests/e2e/` の 9 ファイル / 33 件はすべて未認証状態のスモークまたはガード確認で、認証・DB を伴う主要フローを一切通していない（問題A）。Edge Function 14 本のうちテストを持つのは 9 本で、未テストの 5 本（`notify-dormant-reengage` / `notify-research-adopted` / `notify-weekly-digest` / `send-push` / `social-announce`）はいずれも外部へ送信する副作用を持つ（問題B）。さらに既存の「handler テスト」は 2 系統あり、片方はハンドラを実行していない（問題C）ため、テスト追加の前提としてハンドラの export 化が要る。

## 主要な決定事項の要点

- 対象 5 本を `export async function handleRequest` ＋ `serve(handleRequest)` の形へ揃える。**振る舞いを変えないリファクタリングとして単独で行い、テスト追加とはコミットを分ける**。
- 各関数に最低 3 ケース（webhook secret 不正で 401 / 対象 0 件で `skipped` 200 / オプトアウト時に送信しない）を追加する。`social-announce` は公開 JSON に PII・生座標が含まれないことも検証する。
- 認証・DB を伴う e2e は**2 系統目の Playwright プロジェクト**（例 `chromium-authed`）として追加し、既存の未認証スモーク系統と独立に実行可否を制御する。
- 方式選択（ローカル Supabase か専用テストプロジェクトか）は未決。ローカル方式は `supabase db reset` が from-scratch で失敗する既知問題のため REQ-281 FR-281-01 に依存する。**どちらを採るかは着手時に決め、理由を本要件へ追記する。**
- エラーバウンダリの実描画検証用ルートは本番で到達不能にする（恒久的に到達可能な「クラッシュするページ」を本番に置かない）。
- CI 実行時間を計測し、許容範囲を超える場合は認証系統を `main` push または nightly のみに限定する。

## 部品ファイル

| ファイル | 内容 |
|---|---|
| [01-problem-a-e2e-coverage-gap.md](REQ-311-e2e-and-handler-test-coverage/01-problem-a-e2e-coverage-gap.md) | 背景と問題A: e2e 9 ファイル 33 件の内訳と、主要フローが未カバーである実測 |
| [02-problem-b-c-edge-handler-tests.md](REQ-311-e2e-and-handler-test-coverage/02-problem-b-c-edge-handler-tests.md) | 問題B: 未テスト Edge Function 5 本と副作用の一覧／問題C: 既存 handler テスト 2 系統の違いという実装上の前提 |
| [03-functional-requirements.md](REQ-311-e2e-and-handler-test-coverage/03-functional-requirements.md) | 機能要件 FR-311-01〜06（export 化・ハンドラテスト・認証 e2e 系統・命名整合・エラーバウンダリ・重複整理） |
| [04-acceptance-out-of-scope-and-open-checks.md](REQ-311-e2e-and-handler-test-coverage/04-acceptance-out-of-scope-and-open-checks.md) | 受入基準 AC-01〜09（検証コマンド付き）、対象外、要確認事項 |
