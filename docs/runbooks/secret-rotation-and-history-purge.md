# シークレット失効 & git 履歴除去 手順書（REQ-017）

> 参照要件: [REQ-017](../requirements/REQ-017-secret-rotation.md)（機密ローテーションと git 履歴クリーンアップ）
> 初動・全体方針（先に読む）: [`incident/01-secret-leak.md`](./incident/01-secret-leak.md)
> 鍵別の詳細手順: [`gemini-key-rotation.md`](./gemini-key-rotation.md)　|　secret 反映の再デプロイ: [`edge-function-deploy.md`](./edge-function-deploy.md)
> 今回の漏洩元: [`../verification-2026-05-13.md`](../verification-2026-05-13.md)（§🔐 セキュリティ後始末。実値はマスキング済み）
> gitleaks ピン留め解除の対象: [`../../.gitleaksignore`](../../.gitleaksignore)（`docs/verification-2026-05-13.md` の既知の 1 件の行。2026-10-21 に path ごとの除外から、この 1 件だけに絞った）
> 最終確認日: **2026-06-28**

---

## これは何か

コミット済み・push 済みの平文シークレットが見つかったときに、「**失効 → 新値を Secrets → 動作確認 → git 履歴除去 → gitleaks ピン留め解除**」の一連を実行するための手順書。REQ-017 で検出された Gemini API キー / Supabase access token に即して具体化している。

インシデント全体の初動・連絡・証拠保全は [`incident/01-secret-leak.md`](./incident/01-secret-leak.md) が親 runbook で、本書はその「Step 4 復旧と Git 履歴の対応」を詳細化する位置づけ。

## ⚠️ 着手前に必ず読む

本書は **手順書（読み物）** であり、鍵の失効・`git filter-repo` / BFG による履歴書き換え・`git push --force` は **破壊的で取り返しがつかない**。**エージェント / 自動処理では絶対に実行せず、ユーザーの明示的な判断と操作で行う**。全文は [01-warning-and-when-to-use.md](./secret-rotation-and-history-purge/01-warning-and-when-to-use.md) を参照。

## 主要な決定事項（要点）

- **順序が絶対**: ①失効 → ②新値を Secrets → ③動作確認 → ④git 履歴除去 + force push → ⑤gitleaks ピン留め解除。失効を後回しにした履歴書き換えは無意味。
- push 済みの値は**既に漏洩済み**と考える。履歴を消しても、クローン / キャッシュ / scanning bot には渡っている。
- **値は本書に書かない**。新しい値も、チャット / CLI 引数 / コミットに貼らず、各サービスの Dashboard で直接入力する。
- ①〜③まで済めば**漏洩リスクは実質的に無効化**される。④以降は「これ以上過去の値を目に触れさせない」ための後処理。
- gitleaks のピン留めは**履歴除去が完了してから**外す（履歴に旧値が残る間に外すと CI が失敗する）。

## 各部品

- [01-warning-and-when-to-use.md](./secret-rotation-and-history-purge/01-warning-and-when-to-use.md) — ⚠️ 破壊的操作の警告（全文）と、本書を使う場面。
- [02-order-and-target-secrets.md](./secret-rotation-and-history-purge/02-order-and-target-secrets.md) — 🔑 順序の鉄則（①〜⑤の図）・やってはいけないこと・REQ-017 で検出された対象シークレット表。
- [03-step1-revoke.md](./secret-rotation-and-history-purge/03-step1-revoke.md) — Step 1: 失効（Gemini API キー / Supabase access token / その他の種別）。
- [04-step2-3-secrets-and-verify.md](./secret-rotation-and-history-purge/04-step2-3-secrets-and-verify.md) — Step 2: 新しい値を Secrets へ（配置先の表）／Step 3: 本番での動作確認と旧キー無効化の確認。
- [05-step4-git-history-purge.md](./secret-rotation-and-history-purge/05-step4-git-history-purge.md) — Step 4: git 履歴からの除去（事前調査・バックアップ・filter-repo / BFG・force push と共同作業者への周知）。★破壊的。
- [06-step5-gitleaks-and-exit-criteria.md](./secret-rotation-and-history-purge/06-step5-gitleaks-and-exit-criteria.md) — Step 5: gitleaks ピン留めの解除、終了条件チェックリスト、関連ドキュメント。
