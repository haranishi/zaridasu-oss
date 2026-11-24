## 関連ファイル

- `supabase/functions/analyze-audio/index.ts` — 音声判定本体（冪等性ガード 252-257行）
- `supabase/functions/analyze-image/index.ts` — 画像判定本体（冪等性ガード 192-197行）
- `src/hooks/usePostForm.ts:261-273` — フェーズ 3 で削除対象のクライアント invoke
- `docs/requirements/REQ-072-analyze-audio-edge-function.md` — 要件書（元々 Webhook 起動を指定）
- `docs/requirements/REQ-073-audio-auto-approval-integration.md` — 統合判定ロジック
