## 背景

### 問題A: `_shared/` 変更がEdge Function未デプロイ検知から構造的に漏れる — High

`scripts/check-edge-deploy-lag.sh:192` の変更検出は、awk で **`_shared` を明示的に除外**している。

```bash
git diff --name-only "${diff_range}" 2>/dev/null \
  | awk -F/ '$1=="supabase" && $2=="functions" && $3!="_shared" && $3!="" {print $3}' \
  | sort -u
```

一方 `docs/runbooks/edge-function-deploy.md:37` は次を**明記している**。

> 3. `_shared/` の変更はそれを import する**全関数**に波及するので、原則「全関数デプロイ」を選ぶ。

つまり runbook が「全関数デプロイが必要」と定義している変更を、CIは「変更0件」として扱う。`:211-219` で `CHANGED` が空なら

```
::notice::Edge Function の変更が無いため deploy-lag チェックを skip しました
```

を出して **`MODE=main` でも exit 0** する（未デプロイ検知の結果だけは反映されるが、これは「本番に関数が存在するか」しか見ないため、**中身が古いこと**は判定できない）。

この穴は REQ-287 の実装によって**より危険になった**。REQ-287 は service-role クライアント生成を `supabase/functions/_shared/supabaseAdmin.ts` に集約した（`_shared/__tests__/supabaseAdmin.test.ts` が「どの関数も service-role キーを直接読まない」不変条件を自動導出で検査している）。したがって今後の鍵差し替え（FR-287-05 のレガシーフォールバック削除等）は、**まさに `_shared` 単独変更**になる。

想定される事故シーケンス:

1. `_shared/supabaseAdmin.ts` を変更して新キー方式に切り替える PR をマージ
2. deploy-lag は CHANGED=0 → **CI緑**
3. Edge Function は再デプロイされないため、本番12関数は**旧バンドル**（旧キー参照）で動き続ける
4. 旧キーをローテーション（無効化）した瞬間、12関数が**無言で認証失敗**する
5. 通知系・AI解析は fail-soft のため、誰にも通知されない（→ REQ-285 §2.D と同型）

### 問題B: migration乖離検知がバージョン番号の集合しか見ず、内容ドリフトを検知できない — High

`scripts/check-migration-drift.sh:88` の本番クエリは version 列のみを取得する。

```sql
select version from supabase_migrations.schema_migrations order by version;
```

`supabase_migrations.schema_migrations` は `statements`（適用されたSQL本文）と `name` も保持しているが、いずれも未使用である。`:105-107` の差分は `comm` によるバージョン集合の対称差だけを見る。

- (a) 本番にあるがリポジトリに無い → 検知する
- (b) リポジトリにあるが本番に無い → 検知する
- (c) **同じバージョンで内容が違う（適用済みファイルを後から書き換えた）→ 永久に検知不能**

そして (c) は**このリポジトリに実在するパターン**である。`.github/workflows/ci.yml:210-217` が実測記録として次を書いている。

> ベースライン3本（20240101000000/000001/000002）は最終スキーマに合わせて**在庫的に後から編集**されており、例えば 000001 の posts_public ビューが posts.survey_request_id を参照するが、その列は後発 migration（20260425*）で追加される——from-scratch では未存在で ERROR 42703 になる。

REQ-286 が塞いだのは「1本足りない」型のみである。適用済みSQLを書き換える運用が現に行われているのに、それを検知する層が無い。

### 問題C: 乖離検知のerrorが本番デプロイをブロックせず、順序保証が人手のみ — Medium

`.github/workflows/ci.yml:470` の `deploy` ジョブの `needs` は次のとおりで、`edge-functions-deploy-lag`（migration-drift も同ジョブに相乗り）が**入っていない**。

```yaml
needs: [test, e2e, rls-tests, edge-functions, schema-drift]
```

`:469` に理由が明記されている。

> edge-functions-deploy-lag は main で error 二段構えの情報系ジョブのため needs から除外。

結果、main push で「本番のみ存在する migration」「未デプロイ関数」を **exit 1 で赤にしても、Vercel 本番デプロイは並行して成功する**。

さらに workflow 内に `supabase db push` / `supabase functions deploy` は **0件**である（`vercel.json` の `git.deploymentEnabled` 無効化により、フロントの本番デプロイ経路もCIのみ）。つまり **DB migration と Edge Function のデプロイは完全に人手**であり、「新しいカラムを読むフロントが先に本番へ出て、migration は手動待ち」という順序事故を**機械的に防ぐ層が存在しない**。
