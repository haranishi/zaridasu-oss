# REQ-125: AI判定失敗の管理画面ハンドリング改善

管理画面で「AI判定失敗」としか出ない状態を、失敗種別の表示・詳細ログの参照・再判定ワンクリック・連続失敗の抑制まで含めて作り直す要件。本文は逐語で分割済み（この入口は目次と目的のみ）。

## 目的

1. 管理者が「AI判定失敗」の原因を一目で把握でき、適切な対応（再判定 / 手動承認 / 却下）に進めるようにする
2. 再判定ワンクリック動線を管理画面に追加し、curl 不要にする
3. 構造的な失敗（恒久的に NG な投稿）はフラグで識別し、不要な再判定コストを抑える

## 分割ファイル

- [01-background-and-problems.md](REQ-125-ai-failure-handling/01-background-and-problems.md) — 背景（失敗し得る経路と 2026-05-12 由利本荘市の実例）と現状の問題（該当ファイル・行）
- [02-functional-requirements.md](REQ-125-ai-failure-handling/02-functional-requirements.md) — 要件の機能要件 FR-125-01〜（エラー分類、UI 文言の出し分け、詳細の折りたたみ、再判定ボタン、失敗回数と抑制、redaction ほか）
- [03-nfr-and-data-model.md](REQ-125-ai-failure-handling/03-nfr-and-data-model.md) — 非機能要件とデータモデル変更（`posts.ai_failure_count` 追加、`AIResult.error_kind` 等）
- [04-test-requirements.md](REQ-125-ai-failure-handling/04-test-requirements.md) — テスト要件（Edge Function 単体、`ReviewCardAI` のコンポーネントテスト、E2E）
- [05-acceptance-impact-and-priority.md](REQ-125-ai-failure-handling/05-acceptance-impact-and-priority.md) — 受入条件 AC-125-01〜08、影響範囲（変更対象ファイル・他機能への影響）、優先度と Phase 分け

### 進め方の要点

- **Phase 1（FR-125-01〜04）は data model 変更なしで実装できる**。エラー分類・UI 文言・折りたたみ・再判定ボタンまで。
- Phase 2 で `ai_failure_count` と抑制ロジック＋migration、Phase 3 で AIBadge への波及と E2E。
- 緊急度・重要度ともに High（運用ブロッカー）だが、手動承認が可能なため「致命的」ではない。
