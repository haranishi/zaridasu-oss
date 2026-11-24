# 証拠保全（全 runbook 共通）

> 参照要件: [REQ-220](../../requirements/REQ-220-incident-response-runbook.md) FR-220-09 / AC-07
> 索引: [README.md](./README.md)
> 下敷き（Obsidian・読み取り専用）: `27_Evidence_Preservation_Playbook` / `13_Monitoring_Logging`
> 最終確認日: **2026-06-16**

---

## 大原則

> **緊急時ほど削除を急ぐと証拠を失う。**

封じ込め（失効・削除・公開停止）を始めると、ログ・請求明細・該当画面が**消える / 上書きされる / 時間で揮発する**。
だからこそ **記録 → 保全を封じ込めより前** に行う。ただし「被害が今この瞬間も拡大している」場合（例: 漏洩キーで課金が増え続けている）は、**画面キャプチャ等の最小保全を済ませてから封じ込めに進む**（保全に時間をかけすぎて被害を広げない）。

- 監査ログ（`audit_logs`）は **fire-and-forget で欠落し得る**（`src/lib/auditLog.ts:25-27`）。**ログだけに依存せず**、請求・各社管理画面・Sentry など複数ソースで突き合わせる。
- 保全物にも秘密値・実 PII が含まれ得る。**保全先は本人だけがアクセスできる安全な場所**に置き、チャット / 公開チケットに貼らない（NFR-220-01）。

---

## これは何か

インシデント（秘密漏洩・乗っ取り・課金異常・個人データ侵害・障害）が起きたときに、**何を・どの順で・どう書き出して残すか**を定めた共通ページ。各 runbook の「証拠保全」節はここを参照する。

## 主要な決定事項（要点）

- **順序は「記録 → 保全 → 封じ込め」。** 被害が拡大中のときだけ、最小保全（スクショ）を済ませて封じ込めを先に進める。
- **保全は SELECT / エクスポートのみ。** 対象行を `UPDATE` / `DELETE` しない。原本は読み取り専用にし、調査はコピーで行う。
- **揮発しやすい順に取る**（請求・各社ログは保持期間で消える / Sentry はプラン保持期間あり）。
- **秘密値は保全物にも写さない**（API キーは末尾数文字のみ、GitHub Secret scanning の秘密値はコピーしない）。
- 後から第三者（個人情報保護委員会・専門家・各社サポート）に説明できるよう、**SHA-256・取得者・取得時刻・保存場所**を記録する（chain of custody）。

## 各部品

- [01-first-15-minutes.md](./evidence-preservation/01-first-15-minutes.md) — 最初の 15 分でやること（最小保全チェックリスト）と、そのままコピーして使えるインシデント記録テンプレ。
- [02-preservation-targets.md](./evidence-preservation/02-preservation-targets.md) — ザリダス固有の保全対象を揮発しやすい順に整理（Supabase / Sentry / Vercel / Google Cloud・AI Studio / GitHub / Resend）。監査ログ・ログイン試行・AI 呼び出しの抽出 SQL を含む。
- [03-chain-of-custody.md](./evidence-preservation/03-chain-of-custody.md) — 原本の扱い（読み取り専用・ハッシュ・記録テンプレ）、やってはいけないこと、関連リンク。
