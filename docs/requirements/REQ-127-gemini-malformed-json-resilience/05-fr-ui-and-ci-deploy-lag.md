#### C. UI 出し分け

- [ ] **FR-127-09: `gemini_truncated` / `gemini_safety` 専用文言**
  `src/components/features/admin/ReviewCardAI.tsx` の `getErrorPresentation` に分岐追加:
  - `gemini_truncated`:
    - 文言: 「✂️ AI レスポンスが切れました（自動 retry 後も失敗）」
    - サブテキスト: 「写真を 1 枚に減らすか、別の角度で再投稿を依頼してください」
    - 色: `text-amber-700`（リカバリ可能性あり）
  - `gemini_safety`:
    - 文言: 「🛡️ AI が分析を拒否（safety filter）」
    - サブテキスト: 「画像が AI のポリシー違反と判定されました。手動審査を推奨します」
    - 色: `text-red-700 font-semibold`（再判定で復旧しない）

- [ ] **FR-127-10: 再判定ボタンの抑制ロジック**
  REQ-126 の `gemini_auth` と同じく、`gemini_safety` も再判定 disabled にする（safety filter は確定的）。
  `gemini_truncated` は **既に retry 済み**なので「再判定する」は押せるが連打抑制のためツールチップに「自動 retry 済み。同じ写真では同じ結果になる可能性が高い」と表示する（disabled にはしない）。

#### D. CI でのデプロイラグ検知

- [ ] **FR-127-11: `edge-functions-deploy-lag` ジョブ新設**
  `.github/workflows/ci.yml` に以下を追加（PR / push on main で実行）:
  - `supabase functions list --project-ref ${{ secrets.SUPABASE_PROJECT_REF }}` を叩いて各関数の `updated_at` を取得
  - `git log -1 --format=%cI supabase/functions/<name>/index.ts` でローカルの最終変更時刻を取得
  - 差が 24 時間を超え、かつ `<name>/` 配下に変更がある PR では `warning`（status check は green のまま）
  - `main` で差が 24h を超えた場合は `error` で fail させる（リリースブロッカー扱い）
  - 必要 secrets: `SUPABASE_ACCESS_TOKEN` (既に Supabase CLI で使われている前提) と `SUPABASE_PROJECT_REF`

- [ ] **FR-127-12: deploy 手順を runbook 化**
  `docs/runbooks/edge-function-deploy.md` 新規。内容:
  - 通常デプロイ: `npx supabase functions deploy <name> --project-ref edxmkqmjzbarjdgnkcvc`
  - 全関数: `for fn in $(ls supabase/functions/ | grep -v _shared); do npx supabase functions deploy $fn --project-ref edxmkqmjzbarjdgnkcvc; done`
  - デプロイ後検証: `supabase functions list` で `UPDATED_AT` が今に近いことを確認
  - rollback の手順は `docs/runbooks/ai-model-rollback.md` を参照
