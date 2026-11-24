## 受入条件

- [ ] **AC-125-01**: **Given** `ai_result = { error: '...', error_kind: 'image_fetch' }` の投稿、**When** 管理者が `/admin/posts` を開く、**Then** カードに「📷 画像取得失敗（再判定で復旧可能性あり）」と amber 色で表示される。
- [ ] **AC-125-02**: **Given** error_kind: 'json_parse' の投稿、**When** 同上、**Then** 赤系カラーで「🚫 AI が分析を拒否（手動審査推奨）」と表示される。
- [ ] **AC-125-03**: **Given** error 付き投稿の詳細パネルを開く、**When** 折りたたみをクリック、**Then** `created_at` / `function_name` / `error_message`（300 文字 truncate）/ `latency_ms` が表示される。
- [ ] **AC-125-04**: **Given** `ai_failure_count < 3` の error 付き投稿、**When** 「🔄 再判定する」をクリック、**Then** `supabase.functions.invoke('analyze-image', { body: { record, reanalysis: true } })` が呼ばれ、成功トーストが出て、`fetchPosts()` で一覧がリロードされる。
- [ ] **AC-125-05**: **Given** `ai_failure_count >= 3` の投稿、**When** 同上、**Then** 「🔄 再判定する」が disabled、ツールチップに「連続 3 回失敗のため要手動審査」が表示される。
- [ ] **AC-125-06**: **Given** Edge Function が成功してから次回呼ばれて失敗する、**When** posts UPDATE 完了、**Then** `ai_failure_count = 1`（リセット → +1）になっている。
- [ ] **AC-125-07**: **Given** Gemini API のエラーレスポンスに `key=AIzaXXX` を含む URL、**When** `ai_call_logs` に保存、**Then** `error_message` から `AIzaXXX` の生文字列が消えており `[REDACTED]` に置換されている。
- [ ] **AC-125-08**: **Given** 旧形式の `ai_result = { error: 'foo' }`（error_kind なし）の投稿、**When** 管理画面表示、**Then** クラッシュせず「AI判定失敗（詳細不明）」と表示される。

## 影響範囲

### 変更対象ファイル

| ファイル | 変更内容 |
|---|---|
| `supabase/functions/analyze-image/index.ts` | `aiResult.error_kind` 分類ロジック追加、`error_message` redaction、`ai_failure_count` 増減 |
| `supabase/functions/analyze-audio/index.ts` | 同上（audio_analysis 側） |
| `supabase/migrations/20260512000001_ai_failure_tracking.sql` | 新規。`posts.ai_failure_count` 追加 + index |
| `src/types/post.ts` | `AIResult.error_kind` / `error_message_truncated` 型追加、`AIErrorKind` enum |
| `src/components/features/admin/ReviewCardAI.tsx` | エラー UI 出し分け、折りたたみ、再判定ボタン、disabled ロジック |
| `src/components/features/admin/AIBadge.tsx` | バッジ文言の出し分け（任意・優先度低） |
| `src/views/admin/AdminPostsPage.tsx` | ReviewCard に reanalysis callback を渡す |
| `supabase/functions/_shared/aiLogging.ts` | error_message redaction ユーティリティ追加 |
| `supabase/functions/analyze-image/index.test.ts` | FR-125-07 / 08 テスト追加 |
| `src/components/features/admin/__tests__/ReviewCardAI.test.tsx` | 新規。FR-125-09 |
| `tests/e2e/admin-reanalysis.spec.ts` | 新規。FR-125-10 |

### 他機能への影響

- **REQ-079 (reanalysis rate limit)**: admin バイパスが効くため rate limit には影響なし。ただし FR-125-06 の連続失敗抑制は rate limit より優先される。
- **REQ-076 (gemini-2.5-flash-lite)**: 既存のモデル名はそのまま流用。`error_kind` 判定はモデル非依存。
- **`audit_post_status_change` トリガ**: `ai_failure_count` の UPDATE は `status` 変化を伴わないため audit_logs には記録されない（既存挙動と整合）。
- **`posts` のフロント表示 (`PostCard.tsx`)**: 一般ユーザー側には `error_kind` を見せない（既存通り `ai_result` を直接読み auto_approved 判定のみ）。

## 優先度

- **緊急度**: High（運用ブロッカー。原因不明のままだと AI 判定の信頼性が判断できず、誤承認/誤却下のリスクがある）
- **重要度**: High（管理画面の核機能。コスト管理 (REQ-075) との結合点でもある）
- **理由**: 2026-05-12 のテスト投稿で実際に運用上の盲点が顕在化。再判定動線がないため admin が curl で叩くしかない現状は work-around としても不十分。ただし posts は手動承認可能なため "致命的" ではなく High 止まり。Phase 分け推奨:
  - **Phase 1 (P0 相当)**: FR-125-01〜04（エラー分類 + UI 文言 + 折りたたみ + 再判定ボタン）。data model 変更なしで実装可能。
  - **Phase 2 (P1)**: FR-125-05〜06（`ai_failure_count` + 抑制ロジック）+ migration。
  - **Phase 3 (P2)**: AIBadge への波及 + E2E。
