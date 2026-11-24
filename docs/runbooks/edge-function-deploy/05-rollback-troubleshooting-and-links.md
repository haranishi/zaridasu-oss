## ロールバック

本ドキュメントは前進デプロイの手順。**問題発生時のロールバック**は別 runbook を参照する。

- モデル変更を戻したい場合: [`docs/runbooks/ai-model-rollback.md`](./ai-model-rollback.md)
- API キー / secret の問題: [`docs/runbooks/gemini-key-rotation.md`](./gemini-key-rotation.md)
- Edge Function コードを 1 つ前の commit に戻したい場合は、`git revert <sha>` で revert コミットを作り、再度本手順でデプロイし直す（Supabase に「過去バージョンに切替」する UI は無いため、コードを戻して再 deploy する以外の手段は無い）。

## トラブルシュート

| 症状 | 対処 |
|---|---|
| `Error: Project not linked` | `npx supabase link --project-ref edxmkqmjzbarjdgnkcvc` を一度実行 |
| `Error: Access token not provided` | `supabase login` か `export SUPABASE_ACCESS_TOKEN=...` |
| `Function not found` | 関数ディレクトリ名のタイポ。`ls supabase/functions/` で実名確認 |
| デプロイ後も古い挙動 | Edge ランタイムのキャッシュ。最大 1〜2 分待ってから再確認 |
| `Bundle size too large` | `deno cache` の依存が肥大化している可能性。`_shared/` の import を整理 |

## 関連

- 要件定義: [REQ-127](../requirements/REQ-127-gemini-malformed-json-resilience.md)
- 関連 runbook:
  - [AI 判定モデル ロールバック](./ai-model-rollback.md)
  - [Gemini API キー ローテーション](./gemini-key-rotation.md)
- 対象コード:
  - `supabase/functions/analyze-image/index.ts`
  - `supabase/functions/analyze-audio/index.ts`
  - `supabase/functions/_shared/aiLogging.ts`
  - `.github/workflows/ci.yml`（`edge-functions-deploy-lag` ジョブ）
