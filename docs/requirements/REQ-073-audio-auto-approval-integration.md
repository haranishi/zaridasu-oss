# REQ-073: 自動承認ルールに音声判定を統合

## これは何か

画像判定だけで決まっていた自動承認・自動却下を、**画像＋音声のマルチモーダル統合判定**に置き換える要件。
REQ-072 の FR-072-10 が「REQ-073 に委ねる」と留保した最終判定ロジックの仕様確定にあたる。

## 目的・背景（要約）

`analyze-image` の `shouldAutoApprove` / `shouldAutoReject` は画像判定のみで `status` と `auto_approved`
を決めており、**音声のみ投稿**と**画像・音声の矛盾ケース**をカバーしていない。また `analyze-image` と
`analyze-audio` は独立に動くため、タイミング次第で不整合な `auto_approved` が立ちうる。
`ai_result.combined_decision` を誰が算出・書き込むかも未定だった。

## 主要な決定事項（要点）

- 判定は **`_shared/autoApproval.ts` の `decideAutoApproval()` 1本**に集約し、**両 Edge Function の末尾から
  同じ関数を呼ぶ**。ケース A〜H の 8 パターンで承認・却下・保留を決める。
- **音声のみ投稿は閾値を +0.10 して厳しく**する（写真ありの 0.75 に対し **0.85**）。
- **モダリティ間矛盾（片方 match / 片方 not match かつ confidence>=0.70）は auto_reject**し、
  `rejection_reason='species_mismatch_modalities'` を付ける。admin レビューではなく明示的な却下扱い。
- 片方の解析が未了なら **`awaiting_other_modality` で pending 維持**。もう片方の Webhook 実行時に判定が走る。
  もう片方の解析結果の取得に失敗した場合も、この保留側に倒す（fail-safe）。
- 書き込みは直接 UPDATE をやめ、**`merge_ai_result` RPC による JSONB 部分更新**にする。
  これで他モダリティの解析結果を破壊しない。RPC は **`SECURITY DEFINER` + service_role JWT 限定**。
- 同時実行の後勝ちで片方の analysis が消えるのを防ぐため、RPC 内で **`SELECT ... FOR UPDATE` の行ロック**を取る。
- 後方互換のため、旧トップレベルフィールドも `image_analysis` 直下に出力する形へ移行（REQ-071 と連動）。
- `protect_post_status` トリガーは service_role を許可済みなので**変更不要**。
- 緊急度 Medium / 重要度 High。REQ-069〜072 完了後に初めて意味を持つ統合要件。

## 各部品

| ファイル | 内容 |
|---|---|
| [01-background-and-problems.md](REQ-073-audio-auto-approval-integration/01-background-and-problems.md) | 背景・ユーザーストーリー3件と現状の問題 |
| [02-functional-requirements.md](REQ-073-audio-auto-approval-integration/02-functional-requirements.md) | 機能要件 FR-073-01〜08（判定ルール表 A〜H・完了判定基準・`combined_decision` 構造・`merge_ai_result` RPC の DDL・両 Function の改修） |
| [03-non-functional-and-data-model.md](REQ-073-audio-auto-approval-integration/03-non-functional-and-data-model.md) | 非機能要件 NFR-073-01〜04 と API/データモデル仕様（`DecideInput`/`DecideOutput` 型・`ai_result` 統合構造の例） |
| [04-acceptance-impact-priority.md](REQ-073-audio-auto-approval-integration/04-acceptance-impact-priority.md) | 受入条件 AC-073-01〜10、影響範囲（新規・変更ファイル）、優先度と理由 |
