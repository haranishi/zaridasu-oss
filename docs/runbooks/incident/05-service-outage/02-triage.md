## 切り分け（どこが落ちているか）

| 症状 | まず見る | 推定原因 / 次の手 |
|---|---|---|
| サイト全体がダウン / 白画面 | Vercel Deployments・Status、各社 Status | 直近デプロイのバグ → ロールバック / プロバイダ障害 → 復旧待ち |
| 投稿できない | Supabase Status・Logs、RLS、Edge Function | DB / Auth 障害、RLS / トリガ、Webhook |
| 地図が出ない | フロントのエラー、タイル / データ取得 | クライアントエラー、データ取得失敗 |
| **AI 種判定が止まる** | `ai_call_logs` の `error_kind` | `gemini_auth` → [`gemini-key-rotation.md`](../gemini-key-rotation.md) / 精度・エラー急増 → [`ai-model-rollback.md`](../ai-model-rollback.md) / `gemini_transient` → Google 側障害（Status 確認） |
| ログインできない | Supabase Auth・Status | Auth 障害 / 設定変更 / 乗っ取り（→ [02](./02-account-takeover.md)） |
| データが消えた / 激減 | DB 件数、`audit_logs`、Storage | **データ損失** → 保全のうえ `backup-restore.md`。不審な削除なら [01](./01-secret-leak.md)/[02](./02-account-takeover.md) |

### 各社 Status（障害切り分け）⚠️要確認

- Vercel Status / Supabase Status / Google Cloud Status（`https://status.cloud.google.com/`）/ Resend Status を確認。**プロバイダ側障害なら自分の変更ではない** → 復旧待ち + 一次連絡に切り替える。

---
