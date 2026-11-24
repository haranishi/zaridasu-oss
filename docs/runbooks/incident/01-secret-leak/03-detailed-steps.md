## 詳細手順

### Step 1. 記録・保全（封じ込め前の最小限）

- [evidence-preservation.md](./evidence-preservation.md) の記録テンプレに、**何の秘密・どこに・いつ**出たかを記載。
- GitHub なら **Security → Secret scanning アラート**をスクショ（秘密値はコピーしない）。チャットなら該当メッセージのスクショ（値は隠す）。
- **被害拡大中（課金増・不正アクセス中）なら、最小スクショだけ取って即 Step 2 へ。**

### Step 2. 封じ込め＝発行元で失効 / ローテーション（最優先）

上の対象表の「失効・ローテーション先」に従い、**漏れた秘密を発行元で無効化**する。代表手順:

- **Gemini**: [`gemini-key-rotation.md`](../gemini-key-rotation.md) の Step 1〜4（新キー発行 → Secrets 差替 → 動作確認 → 旧キー Delete）。漏洩時は「旧キー Delete」を**待たずに**できるだけ早く実施。
- **Supabase（service-role / anon）**: Dashboard → Settings → API → 該当キーの **Rotate**。**service-role の rotate は全 Edge Function / サーバー処理に波及**するため、差替後に主要機能（投稿・AI・通知）を確認。
- **Resend**: ダッシュボードでキーを **再発行**し、Supabase の `RESEND_API_KEY` を更新、旧キーを削除。
- **WEBHOOK_SECRET**: 新しい乱数を生成（例 `openssl rand -base64 32`）→ **Supabase Secrets と DB Webhook 設定の両方**を同じ値に更新（片方だけだと送信が落ちる / 素通りする）。
- **Sentry / GitHub / DB 接続**: 各サービスでトークン / パスワードを revoke → 再発行 → 利用側（CI / Vercel / Actions Secrets）に再設定。

> Secrets の更新は **Dashboard 上で直接編集**する（CLI / チャット経由は履歴に残る。`gemini-key-rotation.md` Step 2 の注意に同じ）。

### Step 3. 影響範囲の特定（悪用されたか）

漏れた秘密が「何を許すキーだったか」から逆算して痕跡を確認する。

- **課金系（Gemini / 各種 API）** → Google Cloud Billing・`ai_call_logs` の急増 → [03-cloud-billing-anomaly.md](./03-cloud-billing-anomaly.md)
- **service-role / DB 接続** → Supabase Logs・`audit_logs` に不審な読み書き、データ件数の異常 → 個人データ流出の可能性なら [04-personal-data-breach.md](./04-personal-data-breach.md)
- **Resend** → 送信ログに身に覚えのない大量送信・なりすまし
- **GitHub トークン** → 不審な push / Actions 実行 / 連携アプリ

> ここで**個人データ流出の可能性**が出たら、[04-personal-data-breach.md](./04-personal-data-breach.md) を主 runbook に切り替える（報告義務の判断が要る）。

### Step 4. 復旧と Git 履歴の対応（失効の後）

1. 新しい秘密で本番が正常動作することを確認（主要フローを 1 周）。
2. **失効が済んでから** Git 履歴の対応を検討する:
   - コミット履歴に秘密が残っている場合、履歴書き換え（`git filter-repo` / BFG）で除去できるが、**push 済みの値は既に漏洩済み**。履歴除去は「これ以上目に触れさせない」措置であって、失効の代わりにはならない。
   - 共同編集者がいる場合、履歴書き換え（force push）はクローンの不整合を招くため影響を周知してから行う。
3. 該当の秘密を `.env` / Secrets 管理から**新値に統一**し、古い値の参照が残っていないか確認。

---
