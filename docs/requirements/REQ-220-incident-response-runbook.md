# REQ-220: インシデント対応・情報漏洩対応 runbook の整備

## これは何か

漏洩・乗っ取り・課金異常・障害が起きたときに、**一人でも「考えず読んで動ける」初動 runbook**を
`docs/` 配下に整備するための要件定義。緊急度 Medium / 重要度 High。

## 目的・背景（要約）

ザリダスは少人数運用でありながら **メール・IP・位置情報・写真/音声・プロフィールという PII を
複数種類保持**している。しかし `docs/runbooks/` にあるのは**平時の運用手順のみ**で、
インシデント初動を扱う手順書が 1 件も無い。`docs/requirements/` にも該当主題の要件が存在しない。

Obsidian の `Security_Research`（`07_Incident_Response` / `23_Leak_Response_Playbook` /
`27_Evidence_Preservation_Playbook` / `13_Monitoring_Logging`）に汎用知見の下敷きは既にあるので、
それを**ザリダス固有の構成（Supabase / Vercel / Sentry / Resend / Gemini と実テーブル名）に
落とし込む**のが本要件のスコープ。

## 主要な決定事項（要点）

- 全 runbook を貫く**共通の初動 8 ステップ**を定める：記録 → 証拠保全 → 封じ込め → 影響範囲特定 →
  一次連絡 → 通報・相談 → 復旧 → 再発防止。原則は「**緊急時ほど削除を急ぐと証拠を失う**」。
- **整備する runbook は 5 種**：(1) シークレット/鍵漏洩、(2) アカウント乗っ取り、(3) クラウド課金異常、
  (4) 個人データ漏洩＋個人情報保護委員会報告（**最重要**）、(5) サービス障害。
- 各 runbook に**必須 4 項目**（初動順序 / 連絡先・エスカレーション先 / 判断基準 / **終了条件**）を持たせる。
  「対応したつもり」で閉じないための終了条件を必ず書く。
- シークレット漏洩は「**まず失効・ローテーション → 次に履歴削除**」の順序を厳守し、
  「push / 送信した秘密は漏洩済みとみなす」原則を明記する。
- **法令の数値（報告期限・閾値）や各社 UI・復旧フォーム URL は断定しない。**
  「2026 年時点の最新を公式一次資料で要確認」マーカーと**確認日**を併記する。
- **秘密値・PII を runbook に書かない**（識別はメタデータのみ）。
- 事故時はダッシュボードが使えない前提で、**Markdown 単体で完結・印刷/オフラインでも読める**構成にする。
- `writeAuditLog` は fire-and-forget で**監査ログが欠落し得る**ため、「ログだけに依存しない」注意を書く。
- Obsidian（汎用知見）とリポジトリ（PF 固有手順）の**二層構造**を維持し、
  **Obsidian 側は読み取り専用の下敷きとして扱い、本 REQ では変更しない**。
- 成果物は**ドキュメントのみ**。アプリ本体・Supabase スキーマ・CI には差分を出さない。

## 各部品

| ファイル | 内容 |
|---|---|
| [01-background-and-problems.md](REQ-220-incident-response-runbook/01-background-and-problems.md) | 背景（保持している PII の一覧と Obsidian 側の下敷き）と現状の問題 1〜3（runbook 不在／法令対応の入口が未明文化／検知材料と保全手順が未接続） |
| [02-goals-and-requirements.md](REQ-220-incident-response-runbook/02-goals-and-requirements.md) | 目的と機能要件 FR-220-01〜11（配置・共通初動・5 種の runbook・必須 4 項目・証拠保全・連絡先・Obsidian リンク運用）、非機能要件 NFR-220-01〜04 |
| [03-acceptance-impact-priority.md](REQ-220-incident-response-runbook/03-acceptance-impact-priority.md) | 受入条件 AC-01〜11、影響範囲、優先度と理由 |
