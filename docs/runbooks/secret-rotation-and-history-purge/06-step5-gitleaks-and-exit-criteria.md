## Step 5. gitleaks ピン留め（許可リスト）の解除

履歴から旧値が消えたら、[`../../.gitleaksignore`](../../.gitleaksignore) で暫定的に外していた `verification-2026-05-13.md` の既知の 1 件（fingerprint）を削除する。

> **注意**: Step 1〜3（失効）や本書冒頭のマスキングだけでは**ピン留めを外さない**。`gitleaks detect` は履歴全体を走査するため、
> **git 履歴に旧値が残っている間はピン留めを維持**する（外すと CI が過去コミットの leak を検出して失敗する）。
> ピン留め解除は **Step 4 の履歴除去が完了した後**に行う。

1. [`../../.gitleaksignore`](../../.gitleaksignore) から、`docs/verification-2026-05-13.md` の既知の 1 件（`gcp-api-key` の fingerprint の行と、その説明コメント）を削除する。
   [`../../.gitleaks.toml`](../../.gitleaks.toml) の `paths` 末尾にある、同じファイルの説明コメントも併せて整理する。
   （2026-10-21 までは `paths` でファイルごと除外していたため、同じファイルに新しい鍵が書かれても検出できなかった。今は既知の 1 件だけを外している。
   履歴の書き換えでコミットが変わると、fingerprint は合わなくなり、その行は用済みになる。）
2. ローカルで履歴全体スキャンを実行し、**leak 0 件（exit 0）**を確認する:
   ```bash
   gitleaks detect --source . --config .gitleaks.toml --redact -v
   ```
   - exit 0 → ピン留め解除 OK。`.gitleaksignore` と `.gitleaks.toml` の変更をコミットする。
   - まだ検出される → 履歴除去が不完全。**ピン留めを戻して** Step 4 をやり直す（置換漏れ / 別ファイル / タグに残存など）。
3. CI（gitleaks ジョブ）が pass することを PR で確認する。

---

## 終了条件（チェックリスト）

- [ ] Gemini API キー / Supabase access token を**発行元で失効**し、旧値が無効になったことを確認した（Step 1, 3）
- [ ] 新しい値を **Secrets（Vercel / Supabase / GitHub Actions）に直接登録**し、コミット・チャットに残していない（Step 2）
- [ ] 新しい値で本番の主要フロー（投稿・AI 種判定・通知・管理・CLI）が正常動作する（Step 3）
- [ ] `docs/verification-2026-05-13.md` の作業ツリーは伏字化済み（REQ-017 マスキング）
- [ ] （ユーザー実行）git 履歴から旧値を除去し、force push 済み。共同作業者 / 別クローンへ再クローンを周知した（Step 4）
- [ ] （ユーザー実行）`gitleaks detect` が leak 0 件を返し、`.gitleaksignore` のピン留めを解除した（Step 5）
- [ ] `.env.local` / `supabase/functions/.env` が `.gitignore` 済みで、履歴にも残っていない（REQ-017 AC-01 / AC-02）
- [ ] `.claude/settings.local.json` 等、**ローカルのみ（gitignore 済み）に残る旧値**も、必要なら手元で消去した（失効済みなら無害だが衛生上）

---

## 関連

- インシデント初動（親 runbook）: [`incident/01-secret-leak.md`](./incident/01-secret-leak.md)
- Gemini キー個別手順: [`gemini-key-rotation.md`](./gemini-key-rotation.md)
- secret 反映の再デプロイ: [`edge-function-deploy.md`](./edge-function-deploy.md)
- 要件定義: [REQ-017](../requirements/REQ-017-secret-rotation.md)　|　CI secret scanning: [REQ-210](../requirements/REQ-210-ci-supply-chain-sast-secret-scanning.md)
- ピン留め設定: [`../../.gitleaksignore`](../../.gitleaksignore)（既知の 1 件の fingerprint）と [`../../.gitleaks.toml`](../../.gitleaks.toml)
- 漏洩元ドキュメント: [`../verification-2026-05-13.md`](../verification-2026-05-13.md)
- 公式ツール: [git-filter-repo](https://github.com/newren/git-filter-repo) / [BFG Repo-Cleaner](https://rtyley.github.io/bfg-repo-cleaner/) / [gitleaks](https://github.com/gitleaks/gitleaks)
