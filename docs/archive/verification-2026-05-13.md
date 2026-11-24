> ⚠️ **アーカイブ（2026-07-18 / REQ-282 FR-282-B4）**: 歴史的文書（当時のスナップショット）。以後更新しない。現況は `docs/requirements/` の REQ 文書とインデックスを参照。

# 動作確認チェックリスト (2026-05-13 実装分)

このドキュメントは 2026-05-12〜13 の作業で本番反映した変更を、再開時にチェックするためのリストです。

実装した REQ: 125, 126, 127, 129, 130, 131〜146 + 削除バグ修正 + 各種 CI 修正

---

## これは何か

2026-05-12〜13 に本番反映した変更（REQ-125〜146 ほか）の動作確認チェックリストと、当時残っていた手動作業の記録。長いためセクション境界で分割し、本文は `verification-2026-05-13/` 配下へ逐語で移した。

## 目的・背景の要約

この作業回では Next.js コード変更（Group B・C の大半）と Edge Function・CI の修正をまとめて入れたため、本番反映後に「どこを見て何を確認すればよいか」を一枚に集約した再開用チェックリストとして書かれたもの。公開ページ・ユーザー機能・管理者機能・セキュリティ（DB 直接確認）・AI 判定・CI の 6 領域を順に確認する構成になっている。

## 主要な決定事項・当時の申し送り（要点）

- **手動残作業は 3 件**: ①Vercel デプロイ（セッション中に `vercel login` が失敗したため要再実施）、②REQ-131 の Edge Function webhook 認証の有効化（当時は `WEBHOOK_SECRET` 未設定で grace period = 警告ログ + 通過で動作）、③任意で REQ-138 のバナー判定厳密化。
- **Edge Function の secret を更新したら必ず再デプロイする**（env 反映のため毎回必須）。この運用は REQ-128 で再発防止する予定として残されている。
- **セキュリティ後始末**: 本セッション中に漏れた Gemini API キーと Supabase access token を revoke する必要がある。**表の値は 2026-06-28 の REQ-017 対応でマスキング済みだが、git 履歴には旧実値が残っている**。順序の鉄則は **まず失効 → 最後に履歴除去**（手順は `runbooks/secret-rotation-and-history-purge.md`）。
- 障害時の切り分け表（AI 判定失敗・削除できない・承認されない・Edge Function 401・`/admin/*` にアクセスできない・検索が動かない）と、対応する runbook へのポインタを持つ。

## 分割ファイル

- [01-manual-remaining-tasks.md](verification-2026-05-13/01-manual-remaining-tasks.md) — 手動でやる必要がある残作業 3 件（Vercel デプロイ／REQ-131 webhook 認証 enforcement の手順／REQ-138 バナー判定厳密化）
- [02-checklist-public-user-admin.md](verification-2026-05-13/02-checklist-public-user-admin.md) — 動作確認チェックリスト A 公開ページ／B ユーザー機能／C 管理者機能
- [03-checklist-security-ai-ci.md](verification-2026-05-13/03-checklist-security-ai-ci.md) — D セキュリティ（DB 直接確認）／E AI 判定の挙動／F CI・GitHub Actions
- [04-troubleshooting-commits-and-followups.md](verification-2026-05-13/04-troubleshooting-commits-and-followups.md) — 障害時の確認場所と runbook、本セッションのコミット履歴、セキュリティ後始末、関連 REQ ドキュメント
