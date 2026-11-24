## 目的
- 予算アラート（実績 / 予測）・Vercel Spend Management・Supabase / Vercel 使用量の週次確認を**運用として明文化**し、「予算 = ハード上限ではない」前提で多層の検知を持つ。
- リトライを「課金増幅器」にしないため、**全体タイムアウト・指数バックオフ + ジッタ・再試行対象エラーの限定・（可能なら）冪等キー / DLQ 相当**を設計に組み込み、「成功するまで再試行」を禁止する方針を確定する。
- コスト暴走時に AI 分析を**即座に止められる kill switch（機能フラグ）と段階的停止手順**を用意する。
- 開発 / 本番（Supabase / Gemini / Vercel）の**分離を明示**し、テスト暴走が本番課金へ波及しない構成にする（または現状を確認して文書化する）。
- 課金異常の**検知（利用量 / コストの閾値）と初動 runbook の骨子**を整備する（詳細インシデント対応は REQ-220 に委譲）。

## 要件

### 機能要件
- [ ] FR-218-01（リトライの暴走防止）: `analyze-image/index.ts:513-555` / `analyze-audio/index.ts:324-362` の retry ラッパーに、**(a) 指数バックオフ + ジッタ**（例 `base_delay * 2^attempt` に ±20% のランダム揺らぎ、上限あり）、**(b) retry を含む 1 リクエスト全体の最大経過時間**（例 env `AI_REQUEST_TOTAL_TIMEOUT_MS`、超過で打ち切り）を追加する。現状の **MAX_TOKENS 限定 retry / 認証・SAFETY・入力不正は即 throw** の方針は維持する（25 番ノート判断表に整合）。`maxOutputTokens` を倍にする retry はトークン課金が増えるため、**最大試行回数（現状 3）を env 化（例 `AI_MAX_RETRY`）し、既定値は据え置き、コスト逼迫時に下げられる**ようにする。
- [ ] FR-218-02（冪等性 / 失敗退避の明確化）: 既存の二重解析スキップ（`ai_analyzed_at` / `audio_analysis.analyzed_at` による、`analyze-image/index.ts:618`・`analyze-audio/index.ts:533`）を**「冪等性ガード」として位置づけて維持**し、再分析時を除き同一投稿を二重課金しないことをコメント / テストで明示する。加えて、**retry を使い切って失敗した呼び出しは「無限再投入せず」`ai_failure_count` 加算 + `ai_call_logs` に error 記録で打ち切り**（DLQ 相当 = 手動レビュー / 手動再分析へ退避）とする方針を確定する（現状の `ai_failure_count` 加算ロジック `analyze-image/index.ts:936-939` を踏襲）。新たな自動再投入ループを**追加しない**ことを要件とする。
- [ ] FR-218-03（AI 機能の kill switch フラグ）: Edge Function 共通で参照する**機能停止フラグ**（例 env `AI_ANALYSIS_ENABLED`、既定 `true`）を `_shared/` に追加し、`false` のとき `analyze-image` / `analyze-audio` は **Gemini を呼ばずに `skipped: disabled` を返す**（投稿自体は通常どおり保存され、手動レビューへ回る）。これにより**キーを失効させずに AI 分析だけを即停止**できる。`GEMINI_API_KEY` 未設定時 skip（`:626` / `:501`）と同じ早期 return 経路に統合してよい。フロントの再分析ボタン（`AdminPostsPage.tsx:179-182`・`useEditPost.ts:92`）も、停止中はコスト発生前に弾く / 案内する（実装可否は最小範囲で判断）。
- [ ] FR-218-04（段階的 kill switch 手順の文書化）: 25 番ノート §7 の段階表に対応するザリダス版の**段階的停止手順**を本 REQ または別 runbook（REQ-220 と整合）に記す。最低限:
  1. **利用者 / IP**: REQ-212 のエッジ / DB レート制限で個別を絞る（本 REQ では参照のみ）。
  2. **高額機能（AI 分析）**: FR-218-03 の `AI_ANALYSIS_ENABLED=false`。
  3. **ジョブ / Webhook**: Supabase Dashboard で `posts` の Database Webhook（`analyze-image`/`analyze-audio`）を無効化。
  4. **API 入口**: Vercel Firewall / デプロイ停止（`vercel.json` の `git.deploymentEnabled` は既に false）。
  5. **キー**: `GEMINI_API_KEY` ローテーション / 失効（新キー適用 → 動作確認 → 旧キー無効化の順、16 番ノート / REQ-126 と整合）。
  6. **プロジェクト / billing**: Google Cloud のクォータ最小化 → 最終手段として billing 無効化（**破壊的・復旧不能の可能性があるため専用プロジェクト + バックアップ前提でのみ**。18 / 25 番ノートの警告を明記）。
  各段階に「停止対象 / 用途 / 主なリスク / 担当（= 運用者本人）」を併記する。
- [ ] FR-218-05（予算アラート + Spend Management の運用定義）: 次を**運用手順として文書化**する（コードではなくダッシュボード設定 + 本 REQ への記載）。
  - **Google Cloud**: Gemini を含むプロジェクトに予算アラート（実績 50% / 80% / 100% + 予測 100%）を設定。通知先は本人が日常確認するメール。「予算はハード上限ではない」ことを明記。可能なら Cost Anomaly Detection を有効化。
  - **Vercel**: Spend Management を有効化し、Functions 実行 / 帯域 / 画像最適化（`next.config.ts:13-30` の `images`）の急増を確認できる状態にする。無料 / 低額枠に合わせた通知 / 上限を設定。
  - **Supabase**: DB / Storage / Edge Functions / Egress の使用量を**週次**で確認する運用を定義（18 番ノート §6・運用頻度表）。
  - 既存の `cost:ai` / `/admin/ai-cost`（`scripts/calc-ai-cost.ts`・`src/app/admin/ai-cost/page.tsx`）を**この運用に組み込み**、週次レビューの入力にする。
- [ ] FR-218-06（コスト / 利用量の異常検知の配線）: `ai_call_logs`（トークン / 回数 / status / reanalysis）を用いた**利用量の異常検知**を、既存の通知基盤（`notify-gemini-key-failure` と同様の pg_cron + Edge Function、または週次の手動確認）に最小コストで載せる。少なくとも**「直近期間の AI 呼び出し回数 / 失敗率 / 推定コストが閾値を超えたら通知」**できる経路を定義する（REQ-215 AC-07 の「auto-approve 率 / AI 呼び出し頻度の異常通知」と**重複実装を避け、コスト閾値の観点で補完**。実装主担当が REQ-215 にある場合は本 REQ では閾値 env と運用のみ定義）。通知 / ログには鍵を出さない（`redactAiErrorMessage`、`_shared/aiLogging.ts` 経由）。
- [ ] FR-218-07（開発 / 本番分離の明示）: 開発 / 本番で **Supabase プロジェクト・Gemini（Google Cloud プロジェクト / API キー）・Vercel 環境変数スコープ**を分離する方針を文書化する。最低限、(a) `.env.example` に「本番鍵を開発 / Preview で使い回さない」「Gemini はプロジェクト単位で課金 / レート制限される」旨の注記を追加、(b) 現状が分離されているか**確認して結果を記録**（分離済みなら追認、未分離なら分離タスク化）、(c) CI（`ci.yml:118` の `SUPABASE_PROJECT_REF`）が本番 ref のみを使い、テスト / 開発が本番に書かない構成であることを確認する。実プロジェクトの新規作成までを本 REQ の必須範囲にするかは規模に応じて判断（最小は「方針 + 現状確認 + 注記」）。
- [ ] FR-218-08（送信前サイズ上限の参照 / 補強）: コスト / メモリ暴走を防ぐ「Gemini へ送る前の入力バイト上限」は **REQ-215（FR / AC-08）の主担当**。本 REQ では、(a) その上限が**コスト・ガードレールの一部**であることを明記し、(b) クライアント側の既存上限（`MAX_FILE_SIZE = 5MB`・`MAX_PHOTOS = 3`、`src/lib/constants.ts:176-177`／`MAX_AUDIO_SIZE`・`AudioRecorder.tsx:246`）が**バイパス可能なクライアント制御**であり Edge Function 側のサーバー上限が必要、という根拠を残す。重複実装はしない。

### 非機能要件（該当する場合のみ）
- [ ] NFR-218-01（秘密値の非露出）: 本 REQ で追加 / 変更するコード・設定・ドキュメント・テスト・コミットに、`GEMINI_API_KEY` / `SUPABASE_SERVICE_ROLE_KEY` / `WEBHOOK_SECRET` 等の**実値を一切含めない**（変数名のみ可）。ログ / 通知へ出す経路は `redactAiErrorMessage` 相当を必ず通す。
- [ ] NFR-218-02（既存挙動の非破壊）: FR-218-01〜03 の変更は、既存の MAX_TOKENS retry の意図（REQ-127/130）・dedup（REQ-129）・webhook secret（REQ-131）・鍵失効検知（REQ-126）・再分析レート制限（REQ-079）の挙動を**壊さない**。`AI_ANALYSIS_ENABLED` 既定 `true` / `AI_MAX_RETRY` 既定 = 現状値とし、**デフォルトで現行動作と等価**にする。
- [ ] NFR-218-03（フェイルセーフ）: kill switch / リトライ打ち切り / サイズ超過は、**安全側（自動承認しない・手動レビューへ）**に倒す。停止 / 打ち切りは `ai_call_logs` / `ai_failure_count` に記録し観測可能にする（フェイルオープンで自動承認しない）。
- [ ] NFR-218-04（型・テスト）: Edge Function（Deno）/ TypeScript の型・テストが通ること。retry のバックオフ / 全体タイムアウト / `AI_ANALYSIS_ENABLED` の skip 分岐は、`_shared/__tests__/` / `analyze-image/__tests__` / `analyze-audio/__tests__` の既存書式に合わせて単体テストを追加する（`combineDecision` を index.ts 直書きで参照する既存テスト制約 `analyze-image/index.ts:55-62` を壊さない）。
- [ ] NFR-218-05（一人運用での現実性）: すべての対策は無料〜低額枠 + 手動運用で実行可能な範囲にとどめる。billing 無効化の自動化は**採用しない**（破壊的・復旧不能リスク。手動最終手段として手順化のみ）。
