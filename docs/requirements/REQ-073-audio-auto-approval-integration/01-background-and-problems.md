## 背景
REQ-072 で `analyze-audio` Edge Function が posts.ai_result.audio_analysis を書き込むが、最終的な `posts.status = 'approved' / 'rejected'` と `auto_approved = true` の判定は「画像＋音声」のマルチモーダル統合ロジックで決めなければならない。現状の `supabase/functions/analyze-image/index.ts:280-300` の `shouldAutoApprove` / `shouldAutoReject` は画像判定のみで決定しており、音声のみ投稿や画像・音声の矛盾ケースをカバーしていない。

**ユーザーストーリー**:
- 投稿者として、写真と鳴き声の両方を送った投稿が AI によって確度高く承認されることを期待する。
- 運営として、画像では bullfrog と判定されたが音声では american と出た「モダリティ間矛盾」投稿は自動承認せず admin レビューに回されたい。
- 投稿者として、音声のみで十分明瞭な鳴き声を送れば、写真が無くても自動承認されることを期待する（ただし写真付きより厳しめの閾値で）。

## 現状の問題
- 現在は写真のみで種判定、音声投稿・判定ができない
- `analyze-image` と `analyze-audio` がそれぞれ独立に動作するため、タイミング次第で不整合な `auto_approved` が立つ可能性
- `ai_result.combined_decision` を誰が算出・書き込むかが未定
- 画像 confidence=0.8 で承認されたが、数秒後に音声で confidence=0.9 かつ species_match=false が出た場合の扱いが不明
- REQ-072 の FR-072-10 で「REQ-073 に委ねる」と留保した最終判定ロジックの仕様確定
