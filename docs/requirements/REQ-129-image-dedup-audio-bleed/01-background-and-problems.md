## 背景

2026-05-12 の運用で、**音声なしの新規投稿（申告: アメリカザリガニ）に対して、過去のウシガエル投稿の `audio_analysis` がそっくり転写される**事象が発生した。

具体的な観測:
- 対象投稿 `28ae8a41...` / `2edf4ef9...` (2026-05-12 20:49 由利本荘市)
- `audio_url: null` / `audio_hash: null` (音声なし)
- 写真の `image_hashes: ['2afb5ab...']`
- 同じ image_hash を持つ過去投稿 `33b148c4...` (2026-04-24, **bullfrog 申告 + 音声付き**) が存在
- 結果として現在の投稿の `ai_result` に `audio_analysis: {detected_species: 'bullfrog', confidence: 1, species_match: true, ...}` (analyzed_at: 2026-04-24) が**過去のままで居座る**
- UI 上: 「📷 画像判定: ー / 不明」「🎤 音声判定: ウシガエル 100% ✅一致」「統合判定: waiting_for_image_analysis」

`ai_call_logs` には `analyze-audio` の呼び出しは無く (audio_url=null で no_audio スキップ済み)、`analyze-image` の `dedup_hit` のみ。つまり**音声 Function が誤動作したわけではなく、画像 dedup が音声判定結果を勝手に持ち込んでいる**。

## 現状の問題

### コード上の根本原因

- `supabase/functions/_shared/aiDedup.ts:70` — `findImageDedup` は同一 image_hash の過去投稿の **`ai_result` 全体**を `analysis` として返す:
  ```ts
  const analysis = exact.ai_result as Record<string, unknown> | undefined
  ```
- 一方、`findAudioDedup` (同ファイル :36) は **`ai_result.audio_analysis` だけ** を返す正しい実装:
  ```ts
  const analysis = row?.ai_result?.audio_analysis as Record<string, unknown> | undefined
  ```
  → **非対称な実装になっている**。
- `findImageDedup` (line 54-61) のクエリは `not('ai_result->image_analysis', 'is', null)` のような **「画像判定済み」フィルタを持たない**。`audio_analysis` だけ持つ投稿も hit してしまう。
- `findImageDedup` は **`species` 一致を要求しない**。同じ画像ハッシュなら異種申告の投稿の判定結果も使う（実用上は同一画像なので問題ないはずだが、防御層としては入れたい）。

### Edge Function 側の書き戻し

- `supabase/functions/analyze-image/index.ts:487-490` で dedup hit 時に:
  ```ts
  dedupedAiResult = {
    ...dedup.analysis,
    analyzed_at: new Date().toISOString(),
  };
  ```
  と全体をスプレッドしているため、`audio_analysis` / `combined_decision` / `model` も含めて転写される。

- 続く `:523` で `dedupedAiResult` がある場合は Gemini を呼ばないため、`image_analysis` も生成されない:
  ```ts
  const settled = dedupedAiResult ? [] : await Promise.allSettled(...)
  ```
  → 結果として「画像判定は空、音声判定は過去のもの」という UI 表示になる。

### データ汚染

本番 DB には既に同様の汚染レコードが複数件存在する見込み。バックフィルが必要。

### 付随観察（別 REQ で追跡推奨）

同一 post_id に対し `analyze-image` の `dedup_hit` ログが **2 回連続**で記録されている。Webhook が INSERT/UPDATE 両方で発火、または重複 invoke。冪等性ガードが弱い可能性。本 REQ のスコープ外として `REQ-130` 候補に。
