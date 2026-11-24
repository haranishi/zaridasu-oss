## デプロイ手順

### A. 単一関数のデプロイ（通常）

`<name>` を実関数名（例: `analyze-image`）に置き換える。

```bash
npx supabase functions deploy <name> --project-ref edxmkqmjzbarjdgnkcvc
```

期待される出力:

```
Deploying Function: <name>
Deployed Function: <name>
```

### B. 全関数の一括デプロイ（推奨: `_shared/` 変更時 / リリース時）

`_shared/` を import している関数は全てまとめて出すと取りこぼしが無い。

```bash
# アンダースコア始まり（_shared 等）は関数ではないので除外し、
# .deploy-ignore に載っている「意図的に未デプロイ」の関数も除外する。
# CI（scripts/check-edge-deploy-lag.sh）の判定対象と同じ集合になるように揃えてある。
for fn in $(ls -d supabase/functions/*/ | xargs -n1 basename | grep -v '^_'); do
  if grep -qE "^[[:space:]]*${fn}[[:space:]]*$" supabase/functions/.deploy-ignore 2>/dev/null; then
    echo "==> skip ${fn}（.deploy-ignore に理由付きで記載）"
    continue
  fi
  echo "==> deploying ${fn}"
  npx supabase functions deploy "${fn}" --project-ref edxmkqmjzbarjdgnkcvc
done
```

> Tip: `_shared` は単体デプロイ不可（function ではない）。
>
> ⚠ **`.deploy-ignore` の除外を外さないこと。** 現在 `notify-dormant-reengage` と
> `notify-weekly-digest` が「配信しない」判断で載っており（理由はファイル内コメント）、
> ここでデプロイしてしまうと、停止中の pg_cron を再開した瞬間に意図しないメールが飛ぶ。
> 配信を始めるときは `.deploy-ignore` から行を消してからデプロイする（手順はファイル内に記載）。

### C. secrets が新しく必要な場合（REQ-127 では `GEMINI_MAX_OUTPUT_TOKENS` が該当）

```bash
# 値を CLI 履歴に残したくないので、Dashboard で直接設定するのが安全。
# Supabase Dashboard → Project → Edge Functions → Secrets → New secret
```

CLI を使う場合は `supabase secrets set` だが、**履歴に値が残る**ため非推奨（特に API キー類）。

