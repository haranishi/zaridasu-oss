## 受入条件
- [ ] AC-073-01: **Given** 写真 1 枚 + 音声 1 件の投稿、image.confidence=0.85 species_match=true, audio.confidence=0.90 species_match=true で両方完了、**When** 後発の Edge Function が RPC を呼ぶ、**Then** `status='approved'`, `auto_approved=true`, `combined_decision.reason='both_modalities_match'`（ケース A）。
- [ ] AC-073-02: **Given** 写真は bullfrog 判定（species_match=true, 0.85）、音声は american だが american は鳴かないので species_match=false（confidence=0.80）、**When** 後発の Edge Function が RPC を呼ぶ、**Then** `status='rejected'`, `rejection_reason='species_mismatch_modalities'`（ケース B）。
- [ ] AC-073-03: **Given** 音声のみ投稿（photos 空）、audio.confidence=0.90 species_match=true、**When** analyze-audio が RPC を呼ぶ、**Then** `status='approved'`, `combined_decision.reason='audio_only_high_confidence'`（ケース D）。
- [ ] AC-073-04: **Given** 音声のみ投稿、audio.confidence=0.78（0.85 未満）、**When** RPC 呼び出し、**Then** `status='pending'` 維持（ケース D 閾値未満で低信頼度）。
- [ ] AC-073-05: **Given** 写真+音声投稿で analyze-image が先に完了、analyze-audio まだ、**When** analyze-image が RPC を呼ぶ、**Then** `combined_decision.reason='awaiting_other_modality'`, `status='pending'` 維持（ケース E）。analyze-audio 完了後の 2 回目 RPC 呼び出しで最終判定が走る。
- [ ] AC-073-06: **Given** 写真 `is_appropriate=false`、**When** RPC 呼び出し、**Then** `status='rejected'`, `rejection_reason='inappropriate_content'`（ケース G、音声側の状態に関わらず）。
- [ ] AC-073-07: **Given** 一般ユーザー JWT で `merge_ai_result` RPC を直接呼ぶ、**When** 実行、**Then** `service_role required` エラーで失敗（NFR-073-01）。
- [ ] AC-073-08: **Given** 同時実行の競合テスト — 2 つの pg セッションが同時に同じ post_id で `merge_ai_result('image', ...)` と `merge_ai_result('audio', ...)` を呼ぶ、**When** 両方コミット、**Then** 最終的に `ai_result` に `image_analysis` と `audio_analysis` の両方が存在する（片方が消えない、NFR-073-03）。
- [ ] AC-073-09: Deno 単体テストで `decideAutoApproval` の 8 パターン（A-H）すべてを検証。`_shared/autoApproval.test.ts` に配置。
- [ ] AC-073-10: 既存 `analyze-image` の単体テスト（REQ-050）が引き続き pass すること（リファクタ後もインターフェース互換）。

## 影響範囲
- 新規: `supabase/functions/_shared/autoApproval.ts`
- 新規: `supabase/functions/_shared/autoApproval.test.ts`
- 変更: `supabase/functions/analyze-image/index.ts`（`shouldAutoApprove` / `shouldAutoReject` ロジックを `decideAutoApproval` に置換、`supabase.update` を `supabase.rpc('merge_ai_result', ...)` に置換、`image_analysis` サブキー構造に出力変更）
- 変更: `supabase/functions/analyze-audio/index.ts`（REQ-072 実装に RPC 呼び出しを追加）
- 変更: `supabase/schema.sql`（`merge_ai_result` RPC 追加、`GRANT EXECUTE ... TO service_role`）
- 変更: 管理ダッシュボードの `ai_result` 表示 UI（新構造の `image_analysis` / `audio_analysis` / `combined_decision` を表示するよう改修）
- 変更: `src/components/features/posts/PostCard.tsx` 等で `ai_result` の旧トップレベルフィールドを参照している箇所を新構造対応

## 優先度
- **緊急度**: Medium
- **重要度**: High
- **理由**: REQ-069〜072 完了後に初めて意味を持つ統合要件。先行実装の確認後でよいが、音声投稿の自動承認フロー全体の完成には必須。
