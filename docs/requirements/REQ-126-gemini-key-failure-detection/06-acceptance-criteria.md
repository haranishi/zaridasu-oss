## 受入条件

- [ ] **AC-126-01**: **Given** Gemini が 400 を返す状況、**When** Edge Function が posts を update、**Then** `ai_result.error_kind === 'gemini_auth'` が記録される。
- [ ] **AC-126-02**: **Given** Gemini が 503 を返す状況、**When** 同上、**Then** `ai_result.error_kind === 'gemini_transient'` が記録される。
- [ ] **AC-126-03**: **Given** `error_kind: 'gemini_auth'` の投稿、**When** 管理者が `/admin/posts` を開く、**Then** 「🔑 API キー設定エラー（管理者対応が必要）」が赤色で表示され、再判定ボタンは disabled になる。
- [ ] **AC-126-04**: **Given** 直近 1 時間に `gemini_auth` が 1 件以上ある状態、**When** admin が `/admin/*` を開く、**Then** ヘッダー下に「⚠️ Gemini API キーが無効です」バナーが表示される。
- [ ] **AC-126-05**: **Given** admin が「🔍 Gemini API ヘルスチェック」をクリック、**When** Gemini が有効、**Then** `ok: true` のトーストが緑色で表示、`ai_call_logs` にはレコードが追加されない。
- [ ] **AC-126-06**: **Given** admin が同ボタンをクリック、**When** Gemini が 400、**Then** `ok: false, status: 400, error_kind: 'gemini_auth'` のトーストが赤色で表示される。
- [ ] **AC-126-07**: **Given** 直近 1 時間に `gemini_auth` が `THRESHOLD` 件以上、過去 24 時間に通知未送信、`ADMIN_NOTIFY_EMAIL` 設定済み、**When** `notify-gemini-key-failure` がトリガ、**Then** Resend にメール送信され、`admin_alerts` テーブルに `notified_at` 付きで insert される。
- [ ] **AC-126-08**: **Given** 上記と同条件だが直前 24 時間内に通知済み、**When** 再実行、**Then** Resend は呼ばれない（重複抑制）。
- [ ] **AC-126-09**: **Given** `docs/runbooks/gemini-key-rotation.md` が存在、**When** 管理者が runbook を実行、**Then** ヘルスチェックが `ok: true` を返すまでが 10 分以内に完了できる手順になっている。
- [ ] **AC-126-10**: **Given** Gemini API のエラーレスポンスに `https://...key=AIzaSyXXX` を含む、**When** `notify-gemini-key-failure` がメール本文を構築、**Then** メール本文中に `AIzaSyXXX` の生文字列が現れない（`[REDACTED]` に置換されている）。
