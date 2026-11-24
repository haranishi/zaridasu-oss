## 要件

### 機能要件
- [ ] FR-073-01: 自動承認の統合判定ロジックを**両 Edge Function の末尾**で同じ関数 `decideAutoApproval(aiResult, hasPhotos, hasAudio): CombinedDecision` として実装する。`supabase/functions/_shared/autoApproval.ts` を新設し、`analyze-image` と `analyze-audio` 両方から import する（Deno の `import` は URL ベースだが、同一リポジトリ内は相対 path OK）。
- [ ] FR-073-02: 判定ルール:

  | ケース | 条件 | 判定 |
  |---|---|---|
  | A. 写真+音声 両方完了 | image.species_match=true AND audio.species_match=true AND image.confidence>=0.75 AND audio.confidence>=0.75 AND image.is_appropriate AND audio.is_appropriate AND image.quality!='poor' AND audio.quality!='poor' | **auto_approve** |
  | B. 写真+音声 モダリティ矛盾 | image.species_match=true AND audio.species_match=false AND audio.confidence>=0.70（またはその逆） | **auto_reject**（rejection_reason='species_mismatch_modalities'、rejection_message="画像と音声で異なる種と判定されました"） |
  | C. 写真のみ（音声なし） | 既存 analyze-image のルール（image.confidence>=0.75、image.species_match=true、…） | 既存と同じ |
  | D. 音声のみ（写真なし） | audio.species_match=true AND audio.confidence>=0.85 AND audio.is_appropriate AND audio.quality!='poor' | **auto_approve**（写真なしのため信頼度を +0.10 して厳しく） |
  | E. 写真のみ解析済み・音声解析待ち | image_analysis あり / audio_analysis なし / audio_url IS NOT NULL | **保留**（status=pending のまま、auto_approved=false） |
  | F. 音声のみ解析済み・写真解析待ち | audio_analysis あり / image_analysis なし / photos NOT EMPTY | **保留**（status=pending のまま） |
  | G. 不適切コンテンツ | image.is_appropriate=false OR audio.is_appropriate=false | **auto_reject**（rejection_reason='inappropriate_content'） |
  | H. 高信頼度で種不一致 | いずれかのモダリティで species_match=false AND confidence>=0.70（かつ矛盾ケース B ではない＝もう片方が解析済みでない or 両方不一致） | **auto_reject**（rejection_reason='species_mismatch'） |

- [ ] FR-073-03: 「両方完了したか」の判定基準:
  - 写真あり投稿 = `record.photos?.length > 0`
  - 音声あり投稿 = `record.audio_url IS NOT NULL`
  - 必要な解析: 写真ありなら `ai_result.image_analysis?.analyzed_at` が存在、音声ありなら `ai_result.audio_analysis?.analyzed_at` が存在
  - すべて揃うまで `should_approve` / `should_reject` を false にして status=pending 維持
- [ ] FR-073-04: `ai_result.combined_decision` 構造:
  ```json
  {
    "should_approve": true,
    "should_reject": false,
    "reason": "both_modalities_match" | "audio_only_high_confidence" | "photo_only_approved" | "species_mismatch_modalities" | "inappropriate_content" | "species_mismatch" | "awaiting_other_modality" | "low_confidence"
  }
  ```
- [ ] FR-073-05: posts 更新は JSONB 部分更新で行い、他モダリティの解析結果を破壊しない。具体的には RPC を新設:
  ```sql
  CREATE OR REPLACE FUNCTION public.merge_ai_result(
    p_post_id UUID,
    p_modality TEXT,  -- 'image' or 'audio'
    p_analysis JSONB,
    p_combined_decision JSONB,
    p_should_approve BOOLEAN,
    p_should_reject BOOLEAN,
    p_rejection_reason TEXT,
    p_rejection_message TEXT
  ) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
  DECLARE
    v_key TEXT := CASE WHEN p_modality = 'image' THEN 'image_analysis' ELSE 'audio_analysis' END;
    v_new_ai JSONB;
  BEGIN
    -- JWT が service_role のみ実行許可（Edge Function 経由）
    IF (current_setting('request.jwt.claims', true)::jsonb ->> 'role') IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'service_role required';
    END IF;
    SELECT COALESCE(ai_result, '{}'::jsonb)
      || jsonb_build_object(v_key, p_analysis)
      || jsonb_build_object('combined_decision', p_combined_decision)
      INTO v_new_ai FROM posts WHERE id = p_post_id;
    UPDATE posts SET
      ai_result = v_new_ai,
      ai_analyzed_at = now(),
      status = CASE WHEN p_should_approve THEN 'approved' WHEN p_should_reject THEN 'rejected' ELSE status END,
      auto_approved = CASE WHEN p_should_approve THEN true ELSE auto_approved END,
      rejection_reason = CASE WHEN p_should_reject THEN p_rejection_reason ELSE rejection_reason END,
      rejection_message = CASE WHEN p_should_reject THEN p_rejection_message ELSE rejection_message END,
      reviewed_at = CASE WHEN p_should_approve OR p_should_reject THEN now() ELSE reviewed_at END,
      reviewed_by = CASE WHEN p_should_approve OR p_should_reject THEN NULL ELSE reviewed_by END
    WHERE id = p_post_id;
  END;
  $$;
  ```
  両 Edge Function はこの RPC を呼ぶ。これにより競合・部分更新が安全になる。
- [ ] FR-073-06: 既存 `analyze-image/index.ts:280-345` の `shouldAutoApprove` / `shouldAutoReject` 判定と `supabase.from('posts').update(...)` を、`decideAutoApproval` + `merge_ai_result` RPC 呼び出しに置き換える。後方互換のため旧トップレベルフィールド（`detected_species`, `species_match`, `confidence` など）も `image_analysis` 直下に出力する形に変更（REQ-071 FR-071-04 の移行と連動）。
- [ ] FR-073-07: `analyze-audio` も同じ RPC を呼ぶ。
- [ ] FR-073-08: 両 Edge Function で `combined_decision` 算出前に **もう片方の解析結果を DB から読む**必要がある:
  - analyze-audio は実行時に `SELECT ai_result FROM posts WHERE id=$1` で image_analysis の有無と内容を取得
  - analyze-image は同様に audio_analysis の有無と内容を取得
  - 取得に失敗した場合はケース E/F の「awaiting_other_modality」に倒す
