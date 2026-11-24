## 背景

`supabase/functions/analyze-image/index.ts` および `analyze-audio/index.ts` は、画像取得失敗 / Gemini API エラー / JSON parse エラー / モデル拒否 など複数の理由で失敗し得る。失敗時は `posts.ai_result.error` に文字列が入り、`ai_call_logs.error_message` に詳細メッセージが残る。

しかし管理画面の `ReviewCardAI.tsx:93` は `if (ai.error) return <p>AI判定失敗</p>` という単一のテキスト表示しか持たず、管理者は以下が判断できない:

- 失敗の種別（一時的なネットワーク不具合か、画像が不適切で恒久的に NG か）
- 再判定で復旧する可能性があるか
- 何回連続で失敗しているか

加えて、再判定 (`reanalysis=true` で Edge Function 再呼び出し) は API として実装済み（`analyze-image/index.ts:227` / REQ-079）だが、管理画面側に**呼び出すボタンが存在しない**。現状は curl などで叩くか、`/admin/posts` の状態だけ眺めて手動承認/却下するしかない。

実例: 2026-05-12 由利本荘市のテスト投稿（AI 生成画像のアメリカザリガニ）で `ai_result.error` が立ち「AI判定失敗」のみ表示されたが、原因が API キー不正・Gemini safety filter・画像 URL 失効のどれか不明、再判定動線も存在しない、という運用上の盲点が顕在化した。

## 現状の問題

- `src/components/features/admin/ReviewCardAI.tsx:55` / `:93` — エラー文言が常に「AI判定失敗」「{label}判定失敗」固定で、原因種別を表示しない
- `src/components/features/admin/AIBadge.tsx:146` / `:200` — バッジも「判定失敗」固定
- `src/views/admin/AdminPostsPage.tsx` — 再判定ボタンを呼ぶ UI がなく、再判定したい場合は手動で curl するしかない
- `analyze-image/index.ts:495` で `ai_call_logs.error_message` に詳細を保存しているが、管理画面で参照する経路がない
- `posts.ai_result.error` には short string しか入らず、`error_message` (`ai_call_logs`) との結合が必要
- 連続失敗を抑制する仕組みがなく、構造的に判定不能な投稿でも reanalysis API を叩き続けられる（rate limit はあるが、admin は REQ-079 でバイパス）
