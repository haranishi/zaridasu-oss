## 機能要件

### FR-077-01: 音声無音/低音量チェック
- **説明:** `AudioRecorder.tsx` の録音終了時に Blob を Web Audio API で解析、RMS が閾値以下なら警告
- **入力:** 録音 Blob
- **処理:**
  1. `AudioContext.decodeAudioData` で PCM 化
  2. RMS 計算（全サンプル）
  3. RMS < `-45 dBFS`（要キャリブレーション）なら "silent" 判定
- **出力:** boolean（`isSilent`）
- **バリデーション:** RMS 計算は 100ms 以内に完了
- **エラーハンドリング:** decodeAudioData 失敗時はゲートをスキップ（既存挙動を維持）

### FR-077-02: 音声長さチェック
- **説明:** durationMs < 1000 なら警告
- **入力:** `durationMs`（既に AudioRecorder で取得済み）
- **処理:** 単純な閾値比較
- **出力:** boolean（`isTooShort`）
- **バリデーション:** durationMs=0（VBR mp3 で metadata 取得失敗）の場合はゲートをスキップ（既存 fallback と整合）

### FR-077-03: 画像解像度・blur チェック
- **説明:** 画像アップロード時に Canvas に描画して解像度と blur を計算
- **入力:** File / Blob
- **処理:**
  1. `<img>` または `createImageBitmap` で読み込み、width/height 取得
  2. Canvas に縮小描画 → グレースケール化
  3. Laplacian filter を適用 → variance 計算
  4. width<200 or height<200 → "low_resolution"
  5. variance < 100（要キャリブレーション）→ "blurry"
- **出力:** `{ isLowResolution, isBlurry, width, height, blurScore }`
- **バリデーション:** 計算は 1 秒以内
- **エラーハンドリング:** 失敗時はゲートをスキップ

### FR-077-04: 音声圧縮
- **説明:** 投稿前に音声を 16kHz mono / Opus 32kbps に変換
- **入力:** 録音 Blob（webm/opus 等）
- **処理:**
  1. `AudioContext.decodeAudioData` → 16kHz mono にダウンサンプリング
  2. **Opus エンコード**（Web 上で利用可能なライブラリ。要確認: `opus-recorder`、`@ffmpeg/ffmpeg.wasm`）
  3. 元 Blob と圧縮 Blob の 2 つを返す
- **出力:** `{ originalBlob, compressedBlob, originalSize, compressedSize }`
- **バリデーション:** 圧縮後サイズが元の 50% 以下、かつ 256KB 以下
- **エラーハンドリング:** 圧縮失敗時は元 Blob のみ返し、AI バリアント無しでアップロード続行

### FR-077-05: 画像圧縮
- **説明:** 投稿前に画像を長辺 1024px、JPEG q=85 にリサイズ
- **入力:** File / Blob
- **処理:**
  1. `createImageBitmap` で読み込み
  2. Canvas にリサイズ描画
  3. `canvas.toBlob('image/jpeg', 0.85)`
- **出力:** `{ originalBlob, compressedBlob }`
- **バリデーション:** 圧縮後サイズが元の 30% 以下が望ましい

### FR-077-06: AI バリアントのアップロード
- **説明:** 元データを既存 path にアップロードした上で、AI バリアントを別 path にアップロード
- **path 規則:**
  - 元音声: `post-audio/{post_id}.{ext}`（既存）
  - AI 音声: `post-audio/{post_id}.ai.opus`
  - 元画像: `post-photos/{post_id}/{n}.jpg`（既存）
  - AI 画像: `post-photos/{post_id}/{n}.ai.jpg`
- **代替案:** AI 専用 bucket（`post-audio-ai`, `post-photos-ai`）を新設
- **選定:** 同 bucket 別 path 案を第一候補（bucket 増設の運用負荷回避）

### FR-077-07: Edge Function 側の AI バリアント優先 fetch
- **説明:** `analyze-audio/index.ts` `analyze-image/index.ts` で AI バリアントを優先 fetch
- **処理:**
  1. record.audio_url から AI バリアント URL を導出（`.ai.opus` を試す）
  2. AI バリアントが 404 なら元 URL に fallback
- **出力:** 既存と同型
- **バリデーション:** fetch リトライは 1 回まで

### FR-077-08: フィーチャーフラグ
- **説明:** `AI_INPUT_COMPRESSION_ENABLED` で段階ロールアウト
- **値:** `'true' | 'false' | 'shadow'`（shadow = AI バリアント生成するが Edge Function は元データ参照）
- **配置:** クライアント側は `NEXT_PUBLIC_AI_INPUT_COMPRESSION_ENABLED`、サーバ側は `AI_INPUT_COMPRESSION_ENABLED`

---
