## いつ使うか

- `supabase/functions/<name>/index.ts` または `_shared/` 配下を変更してマージした後
- CI の `edge-functions-deploy-lag` ジョブが warning / error を出したとき（REQ-127 FR-127-11 / AC-127-08, AC-127-09）
- 障害対応で Edge Function のロジック更新が必要なとき

`git push` だけでは **Supabase Edge Function は本番反映されない**。本手順を実行して初めて本番に届く。

## 前提

- Supabase CLI が手元にインストール済み（`npx supabase --version` で確認）
- Supabase へのログイン済み（`supabase login` か `SUPABASE_ACCESS_TOKEN` 環境変数）
- プロジェクト参照 ID: `edxmkqmjzbarjdgnkcvc`（本番）
- 自分のアカウントが当該プロジェクトの **Owner / Developer** ロール
