## 背景

2026-05-12 の運用で、`GEMINI_API_KEY` を Supabase secret 経由でローテーションした後、Gemini が `400 - API key not valid. Please pass a valid API key.` を返す状況が発生した（由利本荘市のテスト投稿で確認）。REQ-125 の改善により管理画面では `error_kind='gemini_api'` の折りたたみ詳細でエラー内容が見えるようになった一方、以下の運用上の問題が残った:

- **「再判定する」を何度押しても復旧しない** — 設定エラー（キー失効・無効化）は transient なネットワーク不具合とは別物で、再判定での復旧見込みがゼロにもかかわらず同じボタンが提示される
- **発見が遅い** — 管理者が投稿カードを開いて初めて気づく。深夜投稿のような unattended 帯では復旧が朝までずれ込む
- **キーの有効性を能動的に確かめる手段がない** — 復旧確認には新規投稿を待つか curl で叩くしかない
- **キーローテーション手順がドキュメント化されていない** — `docs/runbooks/` 配下に他の runbook はあるが、Gemini キー用は欠落

## 現状の問題

### コード上の問題
- `supabase/functions/_shared/aiLogging.ts:53` `classifyAiError` は `gemini_api` を **HTTP ステータスで分割していない**。`400 (invalid key)` も `503 (transient)` も `429 (rate limit)` も全て `gemini_api` に丸められる
- `supabase/functions/analyze-image/index.ts:187` で Gemini エラー時に `throw new Error(`Gemini API エラー (${status}): ${errText}`)` しているが、status コードは文字列に埋め込まれるだけで構造化されていない
- `supabase/functions/_shared/aiLogging.ts:30` の `AiErrorKind` 型に `gemini_auth` / `gemini_transient` がない
- `src/views/admin/AdminLayout.tsx` には警告バナー領域がない
- `src/components/features/admin/ReviewCardAI.tsx` の「再判定する」ボタンは `error_kind` 種別で条件分岐していない（key 失効でも押せてしまう）

### 運用上の問題
- 通知系の既存 Edge Function (`notify-post-status` 等) は `RESEND_API_KEY` で Resend に投げる実装が確立しているが、システムアラート用の宛先 (`ADMIN_NOTIFY_EMAIL`) が未定義
- `docs/runbooks/` には `ai-model-rollback.md` / `bundle-analysis.md` / `web-vitals-setup.md` はあるが、`gemini-key-rotation.md` がない

## 目的

1. **設定エラー（恒久的に失敗）と transient エラー（再判定で復旧見込み）を区別**し、管理画面で適切なアクションを案内する
2. **設定エラー発生を即座に admin に通知**する（プッシュ：メール + 管理画面常時バナー）
3. **回復後の動作確認をワンクリック化**する（軽量 ping）
4. **キーローテーション手順を runbook 化**して属人化を解消する
