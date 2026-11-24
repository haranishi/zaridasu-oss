# REQ-126: Gemini API キー失効/不正の検知・通知・回復動線

## これは何か

`GEMINI_API_KEY` の失効・不正を「設定エラー」として transient エラーと区別し、
検知（分類）→ 通知（メール＋管理画面バナー）→ 確認（ヘルスチェック）→ 回復（runbook）までの
動線を整える要件。2026-05-12 の実障害（`400 - API key not valid.`）の再発防止と MTTR 短縮が目的。

## 背景の要約

キーをローテーションした後 Gemini が 400 を返し続けたが、`classifyAiError` が HTTP ステータスで
分割せず全て `gemini_api` に丸めていたため、復旧見込みゼロでも「再判定する」が提示され、
管理者は投稿カードを開くまで気づけなかった。キーの有効性を能動的に確かめる手段も、
ローテーション手順の runbook も無かった。

## 主要な決定事項の要点

- **`AiErrorKind` を細分化**：`gemini_auth`（400/401/403＝恒久・設定エラー）と
  `gemini_transient`（5xx/429＝一時・再判定で復旧見込み）を追加。既存の `gemini_api` は後方互換で残す。
- **分類は文字列マッチではなく構造化例外で行う**：`GeminiApiError(status, body)` を throw し、
  `classifyAiError` が `status` を見て分類する（文字列引数の後方互換ケースは維持）。
- **過去ログは触らない**：既存 `gemini_api` レコードの再分類はしない。バナーは「直近 1 時間」のみ見る。
- **`gemini_auth` では再判定ボタンを disabled** にし、専用文言・赤系濃色で「管理者対応が必要」と示す。
- **ヘルスチェックは `ai_call_logs` に記録しない**（ログを汚さない）。admin 限定・`maxOutputTokens: 1`。
- **通知は重複抑制付き**：直近 1 時間に閾値（既定 3）以上かつ過去 24 時間未通知のときだけ Resend で送信し、
  `admin_alerts` テーブルで通知済みを管理。メール本文は `redactAiErrorMessage` を再度通す。
- **Phase 分け推奨**：Phase 1 = FR-126-01〜05 + 11（migration も新規 Function も不要で完結）、
  Phase 2 = FR-126-06〜08、Phase 3 = FR-126-09〜10 + `admin_alerts` migration。
- **緊急度 High / 重要度 High**。手動承認で迂回できるため Critical ではない。

## 目次（各部品）

- [01-background-problems-and-goals.md](REQ-126-gemini-key-failure-detection/01-background-problems-and-goals.md)
  — 背景（2026-05-12 の障害と残った運用問題）、現状の問題（コード上・運用上）、目的 4 点。
- [02-fr-error-classification-and-admin-ui.md](REQ-126-gemini-key-failure-detection/02-fr-error-classification-and-admin-ui.md)
  — 機能要件 A（FR-126-01〜03：`AiErrorKind` 拡張・構造化 throw・`classifyAiError` シグネチャ）と B（FR-126-04〜06：再判定抑制・専用文言・常時バナー）。
- [03-fr-healthcheck-notification-and-runbook.md](REQ-126-gemini-key-failure-detection/03-fr-healthcheck-notification-and-runbook.md)
  — 機能要件 C（FR-126-07〜08：`health-gemini` Function と UI ボタン）、D（FR-126-09〜10：通知 Function と環境変数）、E（FR-126-11：`gemini-key-rotation.md` runbook の中身）。
- [04-nfr-and-data-model.md](REQ-126-gemini-key-failure-detection/04-nfr-and-data-model.md)
  — 非機能要件 NFR-126-01〜03（セキュリティ・パフォーマンス・後方互換性）と、`admin_alerts` テーブルの DDL・RLS。
- [05-test-requirements.md](REQ-126-gemini-key-failure-detection/05-test-requirements.md)
  — テスト要件 FR-126-12〜16（分類ロジック・health-gemini・通知 Function・UI・バナー E2E）。
- [06-acceptance-criteria.md](REQ-126-gemini-key-failure-detection/06-acceptance-criteria.md)
  — 受入条件 AC-126-01〜10（Given/When/Then 形式）。
- [07-impact-and-priority.md](REQ-126-gemini-key-failure-detection/07-impact-and-priority.md)
  — 影響範囲（変更対象ファイル表・他機能への影響）と優先度（緊急度・重要度・Phase 分け）。
