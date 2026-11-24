# REQ-219: メール送信ドメイン認証（SPF / DKIM / DMARC）の整備

## これは何か

ザリダスが送る 2 系統のメール（Resend 通知 / Supabase Auth 認証）について、送信ドメインの
DNS 認証レコードを整備し、なりすまし防止と到達性を確保するための要件。詳細は
`REQ-219-email-authentication-spf-dkim-dmarc/` 配下に分割している。

## 目的・背景（要約）

送信系統は (1) Edge Functions から Resend API 経由で送る通知メールと、(2) Supabase Auth の
確認・リセット・変更確認メールの 2 つ。カスタムドメインから送る以上 SPF / DKIM / DMARC は前提インフラで、
これが無いと迷惑メール送りや未達が起き、参加者獲得に直結する。**本件は主に DNS / インフラ設定の要件**で、
コード変更は送信元 From の統一程度にとどまる。下敷きは Obsidian ノート `31_Email_Authentication`。

## 主要な決定事項（要点）

- 通知メールの送信ドメインは **`zarigani-das.com`**（From は `noreply@zarigani-das.com`）で統一済み。
  一方 Web ドメインは **`zaridasu.com`** で、両者は別ドメイン。
- **SPF は 1 本に集約**（複数レコードは無効）。ルックアップ 10 回以内。初期 `~all` → 安定後 `-all`。
- **DKIM は Resend 払い出しのレコードを登録**し 2048 ビット推奨。ダッシュボードで Verified にする。
- **DMARC は `p=none` + `rua=` で監視開始** → 認証漏れを修正 → `quarantine` → `reject` と段階強化。
  **段階を飛ばして `reject` にしない**（正規メールの誤拒否を防ぐ）。
- 通知 3 関数のハードコード From を `NOTIFY_FROM_EMAIL` 経由に統一する（**これが唯一のアプリ側変更**）。
  `RESEND_API_KEY` 未設定時の fail-soft 挙動は壊さない。
- 認証メールは **カスタム SMTP 有効化（a）が推奨・本番方針**。Supabase 既定送信の継続（b）は非推奨で、
  選ぶ場合は制約を運用メモに記録する。
- **Web 専用の `zaridasu.com` には「メールを送らない」宣言**（厳格 SPF `-all` / DMARC `p=reject` / null-MX）を置く。
- DNS レコードの正否はリポジトリ・CI では検証できないため、`dig` と実送信ヘッダで確認する。

## 各部品

| ファイル | 内容 |
|---|---|
| [01-background.md](REQ-219-email-authentication-spf-dkim-dmarc/01-background.md) | 背景（2 系統の送信経路と、SPF/DKIM/DMARC が必要な理由・下敷きノートの要点） |
| [02-current-problems.md](REQ-219-email-authentication-spf-dkim-dmarc/02-current-problems.md) | 現状の問題 1〜4（From の実値と DNS 未確認・Auth SMTP がコメントアウト・Web/Mail のドメイン相違・DNS はコード外） |
| [03-goals-and-functional-requirements.md](REQ-219-email-authentication-spf-dkim-dmarc/03-goals-and-functional-requirements.md) | 目的と機能要件 FR-219-01〜07（SPF 集約・DKIM 登録・DMARC 開始と段階強化・From 統一・Auth 送信方式・Web ドメイン対策） |
| [04-non-functional-requirements.md](REQ-219-email-authentication-spf-dkim-dmarc/04-non-functional-requirements.md) | 非機能要件 NFR-219-01〜04（シークレット非露出・ドリフト防止・到達性維持・fail-soft 維持） |
| [05-acceptance.md](REQ-219-email-authentication-spf-dkim-dmarc/05-acceptance.md) | 受入条件 AC-01〜08（dig の期待出力・Authentication-Results・DMARC 引き上げ記録） |
| [06-impact.md](REQ-219-email-authentication-spf-dkim-dmarc/06-impact.md) | 影響範囲（DNS / 外部サービス設定・限定的なコード変更・機能への影響） |
| [07-priority.md](REQ-219-email-authentication-spf-dkim-dmarc/07-priority.md) | 優先度（緊急度 Medium〜High / 重要度 High）とその理由 |
