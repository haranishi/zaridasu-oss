## 受入条件

- [ ] **AC-127-01**: **Given** Gemini が `finishReason: 'MAX_TOKENS'` で JSON を途中まで返す状況、**When** `analyzeWithGemini` が呼ばれる、**Then** `maxOutputTokens` を倍にして 1 回 retry する。retry でも MAX_TOKENS のまま → `ai_result.error_kind === 'gemini_truncated'` が保存される。
- [ ] **AC-127-02**: **Given** retry で正常 JSON が返る、**When** 同上、**Then** `ai_result.error` は立たず、`auto_approved` 判定が通常通り行われる。
- [ ] **AC-127-03**: **Given** `finishReason: 'SAFETY'`、**When** 同上、**Then** retry せず即 `error_kind === 'gemini_safety'`、`ai_call_logs` には 1 件のみ記録。
- [ ] **AC-127-04**: **Given** `promptFeedback.blockReason: 'PROHIBITED_CONTENT'`、**When** 同上、**Then** `error_kind === 'gemini_safety'`。
- [ ] **AC-127-05**: **Given** Gemini が地の文を前置きしてから JSON を返す (`Here is the analysis: {...}`)、**When** `STOP` で終了、**Then** JSON 抽出に成功し正常 update される。
- [ ] **AC-127-06**: **Given** UI で `error_kind === 'gemini_truncated'`、**When** 管理者が `/admin/posts` を開く、**Then** 「✂️ AI レスポンスが切れました」が amber 色で、再判定ボタンは押せるがツールチップに警告が出る。
- [ ] **AC-127-07**: **Given** UI で `error_kind === 'gemini_safety'`、**When** 同上、**Then** 「🛡️ AI が分析を拒否」が赤色、再判定ボタンは disabled。
- [ ] **AC-127-08**: **Given** PR の diff に `supabase/functions/analyze-image/index.ts` 変更が含まれ、本番 Edge Function の `updated_at` がローカル commit 時刻より 24h 以上古い、**When** CI が走る、**Then** `edge-functions-deploy-lag` ジョブで warning が出る。
- [ ] **AC-127-09**: **Given** `main` ブランチで上記条件、**When** push 後の CI、**Then** ジョブが `error` で fail し、後続のリリースが止まる。
- [ ] **AC-127-10**: **Given** `docs/runbooks/edge-function-deploy.md` が存在、**When** 新メンバが手順を実行、**Then** 30 分以内に全 Edge Function を本番デプロイできる。
