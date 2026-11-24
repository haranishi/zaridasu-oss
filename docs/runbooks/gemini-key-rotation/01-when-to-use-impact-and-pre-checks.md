## いつ使うか

以下のいずれかに該当する場合に本手順を実行する。

- 管理画面の投稿カードに「🔑 API キー設定エラー（管理者対応が必要）」が表示された
- 管理画面ヘッダー直下に「⚠️ Gemini API キーが無効です」バナーが表示された（Phase 2 以降）
- `ai_call_logs.error_kind = 'gemini_auth'` のレコードが直近 1 時間で 1 件以上発生している
- Gemini API のレスポンスが `400 - API key not valid. Please pass a valid API key.` を返す
- アラートメール（Phase 3 以降の `notify-gemini-key-failure`）を受信した

## 影響範囲

- **AI 種判定が完全停止**（`analyze-image` / `analyze-audio` がともに失敗）
- 新規投稿は `ai_result.error_kind = 'gemini_auth'` で記録され `auto_approved=false` のまま `pending` に滞留
- 管理者の手動審査負荷が増える（自動承認/自動却下が動かない）
- **投稿自体は受け付けられる**（書き込みフローは AI に依存しない）

## 事前確認

1. 失敗が **本当に gemini_auth なのか** を確認する（5xx / 429 は `gemini_transient` で自動回復見込み）
   ```sql
   select id, function_name, error_kind, error_message, created_at
   from ai_call_logs
   where status = 'error'
     and created_at > now() - interval '1 hour'
   order by created_at desc
   limit 20;
   ```
2. `gemini_auth` が支配的であれば本手順を実行する。`gemini_transient` 主体なら Gemini 側障害の可能性が高いので [Google Cloud Status](https://status.cloud.google.com/) を先に確認。
