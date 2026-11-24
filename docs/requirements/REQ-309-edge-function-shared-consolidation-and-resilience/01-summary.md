作成日: 2026-07-30
優先度: **P1** ／ 深刻度: **Medium** ／ 種別: バックエンド
状態: **提案 / 未実装**
関連: REQ-287（service-role生成の `_shared` 集約）, REQ-211（エラーログのPII・秘密値除去）, REQ-234（ライフサイクル通知）, REQ-280（通知の冪等性）, REQ-288（依存更新バックログ）, REQ-240/270（webhook認証）, REQ-236（social-announce）, REQ-217（バックアップ・RPO）, REQ-279（ai_call_logs 保持）

## 0. 要件サマリー

REQ-287 は service-role クライアント生成を `supabase/functions/_shared/supabaseAdmin.ts` へ集約し、**自動導出による不変条件テスト**（`_shared/__tests__/supabaseAdmin.test.ts`）で退行を防ぐ形を確立した。しかし同じ整理が必要な共通部品が**未移行のまま残っている**。

- `escapeHtml`（メール本文のHTMLエスケープ＝セキュリティ関連）が **6実装**
- `SPECIES_LABELS`（利用者向けメール・SNS投稿・AIプロンプトのラベル）が **7箇所**に分散し、**すでに乖離**

加えて Edge Function 14本には**集約監視（Sentry等）が無く**、外部API（Resend / Web Push / 集約SNS API）呼び出しに**タイムアウトが無い**。エラー本文の redact も関数ごとに非対称で、`notify-post-status` だけが宛先メールを含みうる本文をログと500応答の両方に生出ししている。

本要件は「REQ-287 が示した集約パターンの適用範囲を広げる」「外部呼び出しを止められる状態にする」「秘密値・PIIの漏出面を閉じる」「依存と定期実行の穴を埋める」の4系統を扱う。
