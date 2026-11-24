### 非機能要件
- [ ] NFR-073-01: RPC `merge_ai_result` は `SECURITY DEFINER` で `service_role` JWT のみ実行可。一般ユーザーからの直接呼び出しは 401/403。
- [ ] NFR-073-02: 片方の Edge Function が一時的に失敗しても、もう片方が正常完了すれば `combined_decision.reason = 'awaiting_other_modality'` で pending 維持。2 回目の Webhook 実行時点で揃えば自動判定が走る。
- [ ] NFR-073-03: 同時実行競合 — 両 Edge Function が「ほぼ同時に」SELECT → MERGE → UPDATE した場合、後勝ちで片方の analysis が消える可能性。`merge_ai_result` 内で `SELECT ... FOR UPDATE` を使い行ロックを取る。
- [ ] NFR-073-04: `protect_post_status` トリガー（`supabase/schema.sql:540-578`）は `service_role` を許可する既存実装のまま、変更不要。

## API / データモデル仕様

### `_shared/autoApproval.ts` インターフェース案
```ts
export interface DecideInput {
  hasPhotos: boolean
  hasAudio: boolean
  imageAnalysis?: {
    species_match?: boolean | null
    confidence?: number | null
    is_appropriate?: boolean
    image_quality?: string
    analyzed_at?: string
    error?: string
  }
  audioAnalysis?: {
    species_match?: boolean | null
    confidence?: number | null
    is_appropriate?: boolean
    audio_quality?: string
    analyzed_at?: string
    error?: string
  }
}
export interface DecideOutput {
  should_approve: boolean
  should_reject: boolean
  reason: string
  rejection_reason?: 'species_mismatch' | 'species_mismatch_modalities' | 'inappropriate_content'
  rejection_message?: string
}
export function decideAutoApproval(input: DecideInput): DecideOutput
```

### `ai_result` 統合構造（REQ-071 と整合）
```json
{
  "image_analysis": { "detected_species": "bullfrog", "species_match": true, "confidence": 0.88, "image_quality": "good", "is_appropriate": true, "analyzed_at": "2026-04-21T12:00:00Z", "photo_count": 2 },
  "audio_analysis": { "detected_species": "bullfrog", "species_match": true, "confidence": 0.92, "audio_quality": "good", "is_appropriate": true, "analyzed_at": "2026-04-21T12:00:02Z" },
  "combined_decision": { "should_approve": true, "should_reject": false, "reason": "both_modalities_match" }
}
```
