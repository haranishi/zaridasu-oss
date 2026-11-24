## 背景
既存の `supabase/functions/analyze-image/index.ts`（357 行）は posts INSERT の DB Webhook をトリガーに Gemini API で写真種判定を行い `ai_result` / `auto_approved` を更新する。音声版として対になる `analyze-audio` Edge Function を新設し、Gemini 2.5 の audio understanding 機能を使ってウシガエル鳴き声を判定する。

Gemini API は 2024 年以降 `audio/mp3` / `audio/wav` / `audio/ogg` / `audio/webm` を `inline_data` で受け付けられる（画像と同じ `inline_data: { mime_type, data: base64 }` インターフェース）ため、`analyze-image` とほぼ同構造で実装できる。

**ユーザーストーリー**:
- 投稿者として、鳴き声だけで投稿したのに AI が「ウシガエルの鳴き声と一致」と判定してくれて、写真投稿と同じように自動承認されることを期待する。
- 運営として、鳴き声投稿も写真投稿と同じ運用フロー（pending → auto_approve / auto_reject / admin review）で審査できる一貫性がほしい。

## 現状の問題
- 現在は写真のみで種判定、音声投稿・判定ができない
- `supabase/functions/analyze-image/index.ts:117-167` の Gemini 呼び出しロジックは写真専用で、`record.audio_url` を見ない
- 鳴き声のみの投稿は常に `pending` のまま滞留し、admin の手作業負荷が増える
- `analyze-image` と `analyze-audio` の両方が posts を更新するとき、どちらが先に書き込むかで `ai_analyzed_at` の上書き競合が起こりうる

## 要件

### 機能要件
- [ ] FR-072-01: 新規ファイル `supabase/functions/analyze-audio/index.ts` を作成。`analyze-image/index.ts` と同じ構造（`corsHeaders`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `SPECIES_LABELS`, `handleRequest` export, `serve(handleRequest)`）。
- [ ] FR-072-02: Supabase DB Webhook 設定 — テーブル `posts`、イベント `INSERT` および `UPDATE`（`audio_url` が変わるケース）、Edge Function `analyze-audio`。INSERT / UPDATE 両方で起動し、内部で条件分岐する。
- [ ] FR-072-03: 早期 return 条件（`analyze-image` の `index.ts:183-188` と対になる）:
  - `record.audio_url` が falsy → `{ skipped: 'no_audio' }` 200
  - `record.ai_result?.audio_analysis?.analyzed_at` が既にセット済み（かつ `reanalysis !== true`）→ `{ skipped: 'already_analyzed' }` 200（冪等性、REQ-050 INV-03 と同パターン）
  - `GEMINI_API_KEY` 未設定 → `{ skipped: 'no_api_key' }` 200
- [ ] FR-072-04: 音声取得 — `fetch(record.audio_url, { signal: AbortSignal.timeout(10_000) })` で 10 秒以内に取得。タイムアウト/非 2xx の場合は `ai_result.audio_analysis.error = 'audio_fetch_failed'` を記録して 200 を返す（Webhook リトライ嵐回避）。
- [ ] FR-072-05: base64 エンコード — `ArrayBuffer` → `Uint8Array` → `String.fromCharCode` ループ → `btoa`（既存 analyze-image `index.ts:122-126` と同じ実装）。
- [ ] FR-072-06: Gemini 呼び出し — モデル `gemini-3.1-flash-lite-preview`（analyze-image と統一、Gemini 2.5 系の音声対応）。`inline_data.mime_type` は Content-Type ヘッダから抽出（`audio/webm` / `audio/mp4` / `audio/mpeg` / `audio/ogg`）。
- [ ] FR-072-07: プロンプト（日本語、JSON 強制。analyze-image のプロンプトと構造を揃える）:
  ```
  あなたは外来生物調査の音響専門家です。この音声を分析して、以下のJSONのみを返してください（説明文・コードブロック・改行は不要）。

  投稿者の申告種: ${speciesLabel}

  {"detected_species":"american|bullfrog|other|unclear","species_match":true|false|null,"confidence":0.0から1.0,"audio_quality":"good|acceptable|poor","is_appropriate":true|false,"concerns":[],"notes":"日本語50文字以内"}

  判定基準:
  - detected_species: 音声に含まれる生物種（bullfrog=ウシガエル「ブォー」「ウー」と低く響く鳴き声, american=アメリカザリガニは鳴かないので基本的に不一致, other=他の生物音, unclear=環境音・雑音のみで判定不能）
  - species_match: 申告種と一致するか（判別不能な場合はnull）
  - confidence: 判定の確信度（0.0〜1.0）
  - audio_quality: good=明瞭, acceptable=判定可能, poor=雑音多・音量低
  - is_appropriate: 人の会話・音楽・不適切なコンテンツが含まれていないか
  - concerns: 該当するもの ["species_mismatch","low_quality","inappropriate","no_animal_sound","multiple_species"]
  - notes: 日本語で簡潔なコメント
  ```
  注意: アメリカザリガニは実際には鳴かないので、species='american' の申告に対しては detected_species='other' または 'unclear' で species_match=false または null になるのが通常の結果。音声投稿は基本的にウシガエル向けの機能。
- [ ] FR-072-08: Gemini レスポンスパース — markdown コードブロック除去 → `JSON.parse`。パース失敗時は catch で `audio_analysis.error = 'gemini_parse_failed'` を記録し、HTTP 200 で応答（INV-04 と同方針）。
- [ ] FR-072-09: posts 更新 — `service_role` key で `supabase.from('posts').update({ ai_result: { ...既存, audio_analysis: {...}, analyzed_at: now }, ai_analyzed_at: now }).eq('id', record.id)` を発行。既存 `image_analysis` を上書きしないよう、**一度 SELECT してマージしてから UPDATE** する（read-modify-write）。
- [ ] FR-072-10: 自動承認判定 — 本 Edge Function 内では `combined_decision` を算出して `ai_result.combined_decision` に保存のみ行う。実際の `status='approved'` / `auto_approved=true` 付与は REQ-073 の統合ロジックに委ねる。
  - 音声のみ投稿（photos 空 or null）の場合: audio `species_match=true` かつ `confidence >= 0.85` で `should_approve=true`
  - 写真あり投稿の場合: 本 Edge Function 単独では `should_approve=false` を保留出力し、REQ-073 が image_analysis と突き合わせて最終判定
- [ ] FR-072-11: `handleRequest` を export してテスト可能に（REQ-050 と同パターン、`serve(handleRequest)` を末尾で呼ぶ）。
- [ ] FR-072-12: 再解析リクエスト対応 — `payload.reanalysis === true` の場合は `already_analyzed` スキップを無視して再実行（analyze-image `index.ts:180-182` と同じ）。クライアントからの JWT で投稿者本人確認を行う（`index.ts:208-232` と同じガード）。

### 非機能要件
- [ ] NFR-072-01: Gemini API キー未設定時は `{ skipped: 'no_api_key' }` 200 で終了（既存と同じ、ローカル開発で key なしでも Webhook がエラーループしない）。
- [ ] NFR-072-02: 音声 fetch / Gemini 呼び出しはそれぞれタイムアウト付き（音声取得 10 秒、Gemini 30 秒）。タイムアウト時はエラー記録のみで Webhook には 200 を返し、リトライ嵐を防止。
- [ ] NFR-072-03: Gemini API エラー（5xx）時、`ai_result.audio_analysis.error` を記録して 200 で終了（500 を返さない）。
- [ ] NFR-072-04: 1 回の実行あたり Gemini API 呼び出しは最大 1 回（音声は複数枚並列処理の写真と異なり 1 ファイルのみ）。
- [ ] NFR-072-05: `console.log` で `[analyze-audio] post ${id} → species_match=..., confidence=..., analyzed=true` を出力（既存 analyze-image と同フォーマット、Supabase Dashboard のログ追跡用）。
- [ ] NFR-072-06: `read-modify-write` の競合対策 — analyze-image と同時実行で書き込み競合した場合、後勝ちで ai_result の一部が消える可能性。対策として **JSONB 部分更新** を使う: `UPDATE posts SET ai_result = COALESCE(ai_result, '{}'::jsonb) || jsonb_build_object('audio_analysis', $1::jsonb, 'analyzed_at', $2::text)` のような SQL を RPC 経由で発行する、または posts テーブルに advisory lock を取る。実装詳細は REQ-073 で一体設計する。

