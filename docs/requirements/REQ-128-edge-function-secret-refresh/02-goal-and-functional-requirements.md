## 目的

1. **Secret 更新が必ず本番 Edge Function に反映される仕組み**を作る
2. **更新が反映されていない状態を検知し、管理者に通知**する
3. **属人運用を排除**し、CI / 自動化で reproducible にする

## 要件

### 機能要件

#### A. health-gemini に「secret 鮮度」検知を追加

- [ ] **FR-128-01: `health-gemini` の拡張**
  `supabase/functions/health-gemini/index.ts` に以下を追加:
  - レスポンスに `function_started_at` (process start 時刻、`globalThis.__startTime` 等で記録) を含める
  - レスポンスに `secret_digest_short`（`GEMINI_API_KEY` の先頭 8 文字を返す。生キーは絶対に出さない）を含める
  - 既存の `ok: bool` 判定と並んで、最後に Management API で取得した secret digest と比較できる情報を返す

- [ ] **FR-128-02: 「secret が新しいが function が古い」を検知するロジック**
  `supabase/functions/health-gemini/index.ts` 内で:
  - process 起動時刻を保持 (`const STARTED_AT = new Date().toISOString()`, module level)
  - レスポンスに `started_at`, `secret_prefix`, `last_secret_change_at`（後者は実装難しければ省略可。本当に必要なら Management API を function 内から叩く）
  - ヘルスチェック UI で `started_at` を表示し、運用者が「ah, 古い container だな」と分かるようにする

#### B. UI 連携

- [ ] **FR-128-03: ヘルスチェックボタンに rich な情報を表示**
  `src/views/admin/AdminDashboard.tsx` のヘルスチェックボタンクリック後のトーストに以下を含める:
  - `ok: true / false`
  - `latency_ms`
  - `function_started_at`（人間可読: 「N 時間前にデプロイ」）
  - `secret_prefix`（先頭 8 文字、例: `AIzaSyAS...`）
  - 注: `secret_prefix` は管理者 only なので JWT で gate

- [ ] **FR-128-04: AdminLayout バナー条件の拡張**
  REQ-126 で実装した `useGeminiAuthBanner` を拡張し、`ai_call_logs` で直近 1h に `error_kind='gemini_auth'` が出ていて、かつ最後の function deploy が `secrets set` より古い場合は、バナー文言を「⚠️ Gemini API キーが新しい可能性。docs/runbooks/edge-function-deploy.md に従い再デプロイしてください」と切り替える

#### C. 運用ドキュメント

- [ ] **FR-128-05: `docs/runbooks/gemini-key-rotation.md` を更新**
  以下のセクションを追記:
  - 「**重要**: `supabase secrets set` の後は必ず `supabase functions deploy analyze-image analyze-audio health-gemini` を実行する」
  - 理由 (Deno.env のスナップショット挙動) を 2〜3 行で説明
  - チェックリスト形式で「① 新キー発行 → ② secret 更新 → ③ 関連 function redeploy → ④ ヘルスチェック ok 確認 → ⑤ 古いキー Revoke」

- [ ] **FR-128-06: `docs/runbooks/edge-function-deploy.md` に「Secret 更新時の取扱い」セクション追加**
  - 「`supabase secrets set` 後は対応する function を必ず再デプロイ」
  - 「対応関数の特定: secret 名から逆引き」（例: `GEMINI_API_KEY` → `analyze-image / analyze-audio / health-gemini / notify-gemini-key-failure`）
  - 「全部まとめて再デプロイする 1-liner: `for fn in $(...); do supabase functions deploy $fn ...; done`」

#### D. CI / 自動化

- [ ] **FR-128-07: secret 変更検知ジョブ**
  `.github/workflows/ci.yml` に新ジョブ `secret-deploy-sync` 追加:
  - **on**: push to main / PR
  - **steps**:
    1. `supabase secrets list -o json --project-ref $PROJECT_REF` で本番 secrets の更新時刻を取得
    2. 各 function の `updated_at` (本番) を取得（REQ-127 FR-127-11 のスクリプトを再利用）
    3. **対応マップ** を `scripts/secret-function-map.json` で定義:
       ```json
       {
         "GEMINI_API_KEY": ["analyze-image", "analyze-audio", "health-gemini", "notify-gemini-key-failure"],
         "GEMINI_IMAGE_MODEL": ["analyze-image", "health-gemini"],
         "GEMINI_AUDIO_MODEL": ["analyze-audio"],
         "RESEND_API_KEY": ["notify-comment", "notify-post-status", "notify-survey-request", "notify-gemini-key-failure"]
       }
       ```
    4. ある secret の `updated_at` > その secret に対応する function の `updated_at` → warning (PR) / error (main)
    5. fail 時は `::error::` で具体的なメッセージを出す

- [ ] **FR-128-08: (任意) secret 更新時に自動 redeploy する GitHub Actions workflow**
  `.github/workflows/redeploy-on-secret-change.yml` 新規:
  - **on**: workflow_dispatch (手動トリガー、`secret_name` を input)
  - secret-function-map.json から関数を逆引き
  - 該当 function を deploy
  - これにより「secret 更新後の deploy 」をワンアクションに集約

#### E. コード側の堅牢化（任意・優先度低）

- [ ] **FR-128-09: 起動時に env 健全性を検証**
  `analyze-image` / `analyze-audio` の起動時 (`serve(...)` 直前) に以下を実行:
  - `GEMINI_API_KEY` が空でないこと
  - `gemini-2.5-flash-lite` 等の指定モデルに対し 1 トークンの ping を非同期に投げ (await しない)、結果を `console.warn` でログ出力
  - これにより function logs を見れば「起動時のキー鮮度」が分かる

- [ ] **FR-128-10: env を `_shared/env.ts` に集約**
  `supabase/functions/_shared/env.ts` を新設し、`Deno.env.get` の参照を全て集約。lazy getter として export する形で、将来 Deno が env hot-reload をサポートしたら 1 箇所変更で済むようにする。現状の lazy getter (`getGeminiApiKey` 等) を移行。

