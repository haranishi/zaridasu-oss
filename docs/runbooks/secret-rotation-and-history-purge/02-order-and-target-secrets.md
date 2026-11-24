## 🔑 順序の鉄則（絶対にこの順）

```
① 失効 (rotate)        ← まず発行元で旧キーを無効化する。これが最優先
   ↓                     （履歴を消しても失効していなければ無意味。push 済み = 漏洩済みと考える）
② 新キーを Secrets へ   ← 新しい値は「コミットしない」。Vercel / Supabase / GitHub Actions Secrets に入れる
   ↓
③ 動作確認             ← 新しい値で本番が正常動作することを確認
   ↓
④ git 履歴除去 + force push   ← ★破壊的。ユーザー判断で実行。バックアップ必須・共同作業者へ再クローン周知
   ↓
⑤ gitleaks ピン留め解除  ← 履歴から消えたことを確認してから .gitleaks.toml の許可リストを外す
```

**やってはいけないこと**

- **失効より先に履歴を書き換える**（順序逆転）。履歴を消しても、push 済みの値は既にクローン / キャッシュ / scanning bot に渡っている前提。
- 新しい値を**またチャット / CLI 引数 / コミット / このrunbook**に貼る（同じ事故の再生産）。値は Dashboard 上で直接入力する。
- 履歴除去（④）だけ済ませて失効（①）を省略する。**失効していなければ何の意味もない**。

---

## 対象シークレット（今回 REQ-017 で検出されたもの）

> **値は本書に書かない。** 識別はプロバイダ名・変数名で行う。実値は [`../verification-2026-05-13.md`](../verification-2026-05-13.md) の
> マスキング前の版（git 履歴）に残っている。本番 Supabase プロジェクト ref は `edxmkqmjzbarjdgnkcvc`（これは公開前提の識別子であり秘密ではない）。

| 種類 | 変数名 | 発行元 / 失効先 | 新値の配置先 |
|---|---|---|---|
| Gemini API キー | `GEMINI_API_KEY` | Google AI Studio / Google Cloud Console | Supabase Edge Functions Secrets |
| Supabase access token | `SUPABASE_ACCESS_TOKEN` | Supabase Dashboard → Account → Access Tokens | GitHub Actions Secrets / ローカルは `supabase login` |

> REQ-017 の背景では `.env.local`（Supabase Anon Key + Gemini キー）・`supabase/functions/.env` も挙がっている。
> これらが**過去コミットに含まれていないか**を §Step 4 の事前調査で必ず確認する。
> 他のザリダス管理シークレット（`SUPABASE_SERVICE_ROLE_KEY` / `RESEND_API_KEY` / `WEBHOOK_SECRET` / `VAPID_PRIVATE_KEY` 等）の
> 一覧と失効先は [`incident/01-secret-leak.md`](./incident/01-secret-leak.md) の「対象シークレット表」を参照。

---
