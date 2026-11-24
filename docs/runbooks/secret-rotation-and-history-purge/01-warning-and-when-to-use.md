> ## ⚠️ 警告（最初に必ず読む）
>
> このドキュメントは **手順書（読み物）** である。以下は **破壊的・取り返しのつかない操作**であり、
> **このエージェント / 自動処理では絶対に実行しない**。
>
> - 鍵の失効（Google / Supabase などの外部サービス操作）
> - `git filter-repo` / BFG Repo-Cleaner による履歴書き換え
> - `git push --force`（履歴の上書き）
>
> 実行は **ユーザーの明示的な判断と操作**で行うこと。履歴書き換え + force push は、共同作業者のローカルクローン・
> 既存の Pull Request・GitHub 上のキャッシュ／フォークに不可逆な影響を与える。**§Step 4 のバックアップを取ってから**着手する。
> 不安があれば、まず [`incident/01-secret-leak.md`](./incident/01-secret-leak.md) の初動だけ（＝失効）を済ませ、履歴除去は落ち着いてから行う。

---

## いつ使うか

- gitleaks / GitHub Secret scanning、または手動レビューで **コミット済み・push 済みの平文シークレット**が見つかった
- 今回のように、ドキュメント（[`../verification-2026-05-13.md`](../verification-2026-05-13.md)）に **Gemini API キー / Supabase access token が平文で残存**していた（REQ-017）
- `.env.local` / `supabase/functions/.env` 等、**コミットすべきでない秘密ファイル**が履歴に含まれている疑いがある（REQ-017 背景）

> このrunbookは「**失効 → 新値を Secrets → 動作確認 → git 履歴除去 → gitleaks ピン留め解除**」の一連を、
> 今回検出されたシークレットに即して具体化したもの。漏洩インシデント全体の初動・連絡・証拠保全は
> [`incident/01-secret-leak.md`](./incident/01-secret-leak.md) を親 runbook とする（本書はその「Step 4 復旧と Git 履歴の対応」を詳細化する位置づけ）。

---
