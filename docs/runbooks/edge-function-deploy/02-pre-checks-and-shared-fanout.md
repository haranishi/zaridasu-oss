## 事前確認

1. 現在の本番デプロイ状況を取得
   ```bash
   npx supabase functions list --project-ref edxmkqmjzbarjdgnkcvc
   ```
   出力の `UPDATED_AT` がローカルの最終コミット時刻より古い関数が対象。

2. デプロイ対象の関数で最近何が変わったか確認
   ```bash
   git log -1 --format=%cI -- supabase/functions/<name>/index.ts
   git log --oneline -5 -- supabase/functions/<name>/
   ```

3. `_shared/` の変更はそれを import する**全関数**に波及するので、原則「全関数デプロイ」を選ぶ。

   > **2026-08-03（REQ-298 FR-298-01/02）: この波及を CI が検知するようになった。**
   > それ以前は `scripts/check-edge-deploy-lag.sh` が変更検出で `_shared` を明示除外しており、
   > **`_shared/` だけを変更したコミットは「変更 0 件」として skip され、本番の全関数が旧バンドルの
   > まま静かに放置されていた**（この runbook が「全関数デプロイが必要」と定義している変更を、
   > CI は変更なしと扱っていた）。現在は次のとおり:
   >
   > - `_shared/` に差分があると、判定対象が**リポジトリの全関数へ自動展開**される
   >   （除外されるのは `supabase/functions/.deploy-ignore` に理由付きで載っている関数だけ）
   > - 本番の関数 `updated_at` が `_shared/` の最終コミット時刻より古い場合も検知する
   >   （関数自身の `index.ts` は変わっていないので、従来の比較だけでは素通りしていた）
   >
   > 現行workflowではPRの遅延検知がwarningを出し、main pushではこのジョブを起動しない。
   > スクリプトの `MODE=main` はエラー終了できるが、現在のCIで自動実行されるという意味ではない。
   > `_shared/supabaseAdmin.ts` だけを
   > 変更する作業で、本番 12 関数が旧キーを参照したまま無言で認証失敗する事故を防ぐためのもの。

