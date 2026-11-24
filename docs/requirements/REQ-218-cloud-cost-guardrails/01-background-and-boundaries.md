## 背景
ザリダス（Next.js 15 / Supabase（DB・Storage・Egress・Edge Functions）/ Vercel（Functions・帯域・画像最適化）/ Gemini API）は、利用者が増えるほど従量課金が増幅する構造を多数抱える。具体的には (a) ユーザー投稿の画像 / 音声アップロード（Storage 書き込み + Egress）、(b) Gemini による AI 分析（`analyze-image` / `analyze-audio` Edge Function、および再分析）、(c) 地図タイル取得、(d) Vercel 画像最適化（`next.config.ts` の `images`）である。これらは「正常な利用増」でも「実装事故（再試行・ジョブ暴走）」でも「bot / 鍵漏えいによる API 悪用」でも費用が伸びる。

本 REQ は、Obsidian ノート **25_Cloud_Cost_Abuse_Defense**（クラウド課金事故・API 悪用の予防 / 検知 / 封じ込め / 説明、再試行の課金増幅器化、段階的 kill switch、billing 無効化の破壊性）と **18_Cloud_IAM_Billing_Guardrails**（課金ガードレールの多層化、予算アラートはハード上限ではない、開発 / Preview / 本番の分離、Vercel Spend Management・Supabase 週次確認）を下敷きに、**コスト面のガードレール**を運用 + 一部コード（リトライ設計・送信前サイズ上限・kill switch）の両面で整備する。

両ノートが繰り返し強調するとおり、**予算アラートはハード上限ではなく、設定額を超えても利用や請求は自動停止しない**。したがって単一の防壁に頼らず、次の順序で多層に防ぐ方針を採る:

> **分離 → 認証制限 → 利用量制限 → 暴走防止 → 検知 → kill switch → 説明可能性**

ザリダスは一人運用の卒研 PF であり、大掛かりな WAF / FinOps 製品ではなく、Vercel / Supabase / Google Cloud の無料〜低額枠で実行できる手段（予算アラート・Cost Anomaly Detection・Vercel Spend Management・週次の使用量確認・手動の段階的 kill switch・env フラグによる機能停止）を優先する。

> **境界（隣接 REQ との重複回避）**
> - 本 REQ は **「課金・コスト面のガードレール」**（予算アラート・使用量監視・段階的 kill switch・リトライ暴走の抑止・冪等性 / DLQ・開発 / 本番分離・課金事故 runbook の骨子）に集中する。
> - **入口防御（エッジでの bot / レート制限・CAPTCHA・通報 / コメント / いいねの頻度上限）は REQ-212**（公開エンドポイントの bot 対策）。本 REQ では既存 / REQ-212 のレート制限を**前提・補完**するにとどめ、入口の新規実装は持ち込まない。
> - **AI 出力検証・プロンプト無害化・受信後検証・送信前サイズ上限の「検証層」は REQ-215**（AI/LLM セキュリティ）。本 REQ はそのうち**「コスト暴走を止める」観点（送信前サイズ上限・リトライ上限・AI 機能の kill switch）を運用ガードレールとして横串で参照・補強**する。実装の主担当が REQ-215 にある項目は本 REQ で重複実装せず、運用 / 設定 / フラグ側を定義する。
> - **鍵失効検知の通知（`notify-gemini-key-failure`）は REQ-126 で実装済み**。本 REQ は同経路を「コスト異常検知」の一部として運用に組み込む。
> - **インシデント / 漏洩対応 runbook 全般は REQ-220**。本 REQ では「課金事故」に限定した初動の骨子のみ定義し、詳細は REQ-220 へ委譲する。

実コード / 設定を確認した上での現状は以下のとおり。**「設定が無い」ことは事実として明記**し、推測は (推測) と記す。
