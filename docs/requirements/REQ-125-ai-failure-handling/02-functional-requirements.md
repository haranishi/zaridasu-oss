## 要件

### 機能要件

- [ ] **FR-125-01: エラー種別の分類**
  Edge Function (`analyze-image/index.ts` / `analyze-audio/index.ts`) が `posts.ai_result.error` に格納する文字列を、構造化した `error_kind` フィールドに置き換える（または併存させる）。種別は以下:
  - `image_fetch` — `画像の取得に失敗しました (status)` 系
  - `gemini_api` — `Gemini API エラー (status): ...` 系
  - `json_parse` — `JSON.parse` 失敗（safety filter / non-JSON response 含む）
  - `unknown` — 上記以外
  ai_result スキーマ: `{ error: string, error_kind?: 'image_fetch' | 'gemini_api' | 'json_parse' | 'unknown' }`

- [ ] **FR-125-02: エラー種別に応じた UI 文言出し分け**
  `ReviewCardAI.tsx` で `error_kind` を見て以下のように表示:
  - `image_fetch` → 「📷 画像取得失敗（再判定で復旧可能性あり）」
  - `gemini_api` → 「⚠️ AI API エラー（再判定または時間を置いて再試行）」
  - `json_parse` → 「🚫 AI が分析を拒否（手動審査推奨）」
  - `unknown` / 未分類 → 「AI判定失敗（詳細不明）」
  色は `text-amber-600` (回復可能系) / `text-red-600` (手動審査推奨系) で分ける。

- [ ] **FR-125-03: 生エラー詳細の管理者向け表示**
  `ReviewCardAI.tsx` から `ai_call_logs.error_message` を読み込み、エラー UI をクリックで折りたたみ展開（`<details>` 要素）。展開時に以下を表示:
  - `created_at` (失敗発生時刻)
  - `function_name` / `model`
  - `error_message` の生テキスト（最大 300 文字で truncate）
  - `latency_ms`
  個人情報・API キー文字列は Edge Function 側で除去済みであることを `analyze-image/index.ts` / `analyze-audio/index.ts` の error_message 構築箇所で再確認する。Gemini API のエラーレスポンスに含まれる `key=AIza...` の URL クエリ部分は **置換してから保存**する。

- [ ] **FR-125-04: 再判定ボタン（管理者向け）**
  `ReviewCardAI.tsx` のエラー表示の下に「🔄 再判定する」ボタンを追加。クリックで以下を実行:
  - `supabase.functions.invoke('analyze-image', { body: { record: post, reanalysis: true } })` を呼ぶ（音声付き投稿は analyze-audio も）
  - 押下中は disabled + spinner、完了後 `fetchPosts()` で投稿一覧をリロード
  - `useToastContext().show()` で成否トーストを出す（成功: 「再判定を開始しました」、失敗: エラーメッセージ）
  音声付き投稿の場合は両方を並列で呼ぶ。

- [ ] **FR-125-05: 連続失敗カウンタ**
  `posts` テーブルに `ai_failure_count integer NOT NULL DEFAULT 0` を追加。
  - Edge Function が `aiResult.error` を立てて posts を update する際、`ai_failure_count = posts.ai_failure_count + 1` を SET
  - 成功時は `ai_failure_count = 0` にリセット
  - 既存の audit trigger (`audit_post_status_change`) に影響しないよう、UPDATE は通常パスで実行（既存の `auto_approved` 周りの skip 条件と同様の取り扱い）

- [ ] **FR-125-06: 再判定ボタンの抑制ロジック**
  `ai_failure_count >= 3` の投稿では「🔄 再判定する」ボタンを disabled にし、ツールチップで「連続 3 回失敗のため要手動審査」と表示。代わりに「✅ 承認」「❌ 却下」のみで対応する運用にする。
  既存の `reanalysis` rate limit (REQ-079) とは独立に動作する（admin バイパスを上書きする形）。
