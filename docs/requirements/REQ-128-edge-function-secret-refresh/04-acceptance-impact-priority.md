## 受入条件

- [ ] **AC-128-01**: **Given** 本番で `supabase secrets set GEMINI_API_KEY=<新>` を実行、**When** 該当 function が未再デプロイ、**Then** PR / main の CI で `secret-deploy-sync` ジョブが warning または error を出す
- [ ] **AC-128-02**: **Given** admin がダッシュボードのヘルスチェックボタンを押す、**When** function が古い env で動作中、**Then** トーストに `secret_prefix: AIzaSy○○...` と `started_at: N時間前` が表示され、運用者が「再デプロイすべき」と判断できる
- [ ] **AC-128-03**: **Given** `docs/runbooks/gemini-key-rotation.md` を新メンバが読む、**When** キーローテーションを実行、**Then** redeploy ステップを飛ばさず復旧できる（手順書だけで完結する）
- [ ] **AC-128-04**: **Given** `redeploy-on-secret-change.yml` を `workflow_dispatch` で `secret_name: GEMINI_API_KEY` 指定で起動、**When** 完了、**Then** `analyze-image / analyze-audio / health-gemini / notify-gemini-key-failure` の 4 function が全て再デプロイされる
- [ ] **AC-128-05**: **Given** `scripts/secret-function-map.json` のキーに実存しない env 名が含まれる、**When** `npx vitest run scripts/__tests__/secret-function-map.test.ts`、**Then** テストが fail する
- [ ] **AC-128-06**: **Given** `health-gemini` レスポンスに `secret_prefix` を要求した非 admin、**When** 呼び出し、**Then** `secret_prefix` フィールドは返らず（または `[REDACTED]`）、`ok` 等は通常通り返る

## 影響範囲

### 変更対象ファイル

| ファイル | 変更内容 |
|---|---|
| `supabase/functions/health-gemini/index.ts` | `started_at` / `secret_prefix` 追加（admin only） |
| `supabase/functions/health-gemini/__tests__/handler.test.ts` | テスト追加 |
| `src/views/admin/AdminDashboard.tsx` | ヘルスチェックトーストの情報表示拡張 |
| `src/hooks/useGeminiAuthBanner.ts` | バナー文言の条件分岐追加 (FR-128-04) |
| `docs/runbooks/gemini-key-rotation.md` | redeploy 必須セクション追加 |
| `docs/runbooks/edge-function-deploy.md` | 「Secret 更新時の取扱い」セクション追加 |
| `.github/workflows/ci.yml` | `secret-deploy-sync` ジョブ追加 |
| `.github/workflows/redeploy-on-secret-change.yml` | 新規（FR-128-08） |
| `scripts/secret-function-map.json` | 新規（FR-128-07 用 mapping） |
| `scripts/__tests__/secret-function-map.test.ts` | 新規（FR-128-12） |
| `supabase/functions/_shared/env.ts` | 新規（FR-128-10、任意） |

### 他機能への影響

- **REQ-126 (health-gemini, AdminLayout バナー, notify-gemini-key-failure)**: バナー文言と health-gemini のレスポンスフィールドが拡張される。後方互換は維持
- **REQ-127 (edge-functions-deploy-lag CI)**: `secret-deploy-sync` ジョブは並列で動く別ジョブ。`check-edge-deploy-lag.sh` と相補的（前者は code 変更、後者は secret 変更を見る）
- **CI 実行時間**: `secret-deploy-sync` は 30 秒以内なのでパイプライン全体への影響は軽微
- **secret rotation のオペレーション**: 既存 runbook を読んでいる運用者は新セクションを読む必要あり

## 優先度

- **緊急度**: High（実際に 2026-05-12 で 1 時間以上の障害が発生）
- **重要度**: High（API key rotation は今後も発生する。次回の MTTR を短縮する効果が大きい）
- **理由**: コード品質や機能改善ではなく、**運用継続性 / 障害復旧の高速化**に直結。Phase 分け推奨:
  - **Phase 1 (P0)**: FR-128-05 + FR-128-06（runbook 更新だけで、次回事故時に手順書を読めば回避可能になる）
  - **Phase 2 (P1)**: FR-128-01〜04（health-gemini と UI の検知強化）
  - **Phase 3 (P2)**: FR-128-07 + FR-128-08 + FR-128-12（CI 検知 + 自動 redeploy）
  - **Phase 4 (任意)**: FR-128-09 + FR-128-10（コード堅牢化）
