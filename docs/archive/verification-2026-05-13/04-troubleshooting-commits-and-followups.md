## 🚨 何か壊れたらまずここを見る

| 症状 | 確認場所 |
|---|---|
| AI 判定失敗 | Supabase Dashboard → Edge Functions → Logs (analyze-image / analyze-audio) |
| 削除できない | ブラウザ DevTools コンソールの `[admin.delete]` ログ、または `audit_logs_action_check` |
| 投稿が承認されない | `posts.ai_result.error_kind`、`ai_call_logs.error_message` |
| Edge Function 401 | WEBHOOK_SECRET 設定有無、Database Webhook ヘッダー設定 |
| `/admin/*` にアクセスできない | middleware fail-closed 動作、Supabase 接続性 |
| 検索が動かない | PostgREST escape の問題、ブラウザ DevTools Network |

詳細な runbook:
- `docs/runbooks/gemini-key-rotation.md` (REQ-126)
- `docs/runbooks/edge-function-deploy.md` (REQ-127)
- `docs/runbooks/ai-model-rollback.md` (REQ-076)

---

## 📊 本セッションのコミット履歴 (参考)

| コミット | 内容 |
|---|---|
| `5cbcf30` | /admin/posts SSR エラー修正 (ReviewCardMiniMap dynamic) |
| `74dc6e4` `8118e0e` | edge-functions CI flake 修正 (deno.lock + --cached-only + --no-check) |
| `4d13ca5` `907d170` | REQ-125: AI判定失敗 UI 改善 |
| `d0ebf21` | REQ-126: Gemini キー失効検知 + バナー + 通知 |
| `57c508a` `64fc065` | REQ-127: malformed JSON 頑健化 + retry + CI deploy-lag |
| `9308d4c` `4215934` | 削除バグ修正 + audit_logs CHECK 拡張 |
| `85a334e` | REQ-129: 画像 dedup 音声混入修正 |
| `e49350f` `64fc065` | REQ-130: thinkingBudget=0 + responseSchema + retry x2 |
| `486de82` | REQ-133〜139 (Group A): DB ドリフト + RLS 強化 |
| `136f2d5` | REQ-131,132,137,138 (Group B): 認証 + 入力検証 |
| `99ed26d` | REQ-140〜146 (Group C): パフォーマンス + バンドル + DRY |

---

## 🔐 セキュリティ後始末 (本セッション中に漏れた認証情報)

以下を **revoke** してください:

| 種類 | 値（マスキング済み） | 場所 |
|---|---|---|
| Gemini API キー | `<GEMINI_API_KEY_REDACTED>` | https://aistudio.google.com/app/apikey |
| Supabase access token | `<SUPABASE_ACCESS_TOKEN_REDACTED>` | https://supabase.com/dashboard/account/tokens |

> ℹ️ 上表の実値は **REQ-017 対応で 2026-06-28 にマスキング済み**（元は平文の Gemini API キーと Supabase access token が記載されていた）。
> ただし **マスキングは作業ツリー上の伏字に過ぎず、git 履歴には旧実値が残っている**。失効（rotate）と git 履歴除去の具体手順は
> [`runbooks/secret-rotation-and-history-purge.md`](runbooks/secret-rotation-and-history-purge.md) を参照（順序の鉄則: **まず失効 → 最後に履歴除去**）。

revoke 後の流れ:
1. 新 Gemini キーを AI Studio で発行 → Supabase Dashboard で直接 secret 更新 (チャット経由しない)
2. **その直後に必ず Edge Function を再デプロイ** (env キャッシュ問題回避、REQ-128 で再発防止予定)

---

## 📚 関連 REQ ドキュメント

実装済の REQ ドキュメントは `docs/requirements/REQ-125.md` 〜 `REQ-146.md` を参照。

未実装の要件 (将来タスク):
- **REQ-128**: Edge Function secret 反映運用 (runbook + CI + health-gemini 拡張)
- **REQ-131 banner strictification (REQ-131 と関連)**: gemini_auth を 401/403 のみに絞る
