## 機能要件

### FR-082-01: 録音 blob の client-side duration patch
- **説明:** `recorder.onstop` で生成した blob に対し `fix-webm-duration` を適用してから親に渡す
- **入力:** Blob (audio/webm), 経過時間 ms
- **処理:**
  1. mime が `audio/webm` で始まるなら `fixWebmDuration(blob, durationMs)` を呼ぶ
  2. 失敗（library 内 throw）した場合は元 blob を使う（fail-soft）
  3. それ以外の mime はそのまま通す
- **出力:** patched Blob
- **エラーハンドリング:** library 内例外は捕捉して元 blob を返す（投稿フローを止めない）

### FR-082-02: AudioPlayer の workaround 改良
- **説明:** seek workaround を `Number.MAX_SAFE_INTEGER` に変更、`durationchange` を listening して duration 確定タイミングを掴む
- **処理:**
  1. `loadedmetadata` で duration が `Infinity` か判定
  2. 不確定なら `currentTime = Number.MAX_SAFE_INTEGER` を try-catch で実行
  3. 並行して `durationchange` を listening し、確定したら（finite かつ > 0）、currentTime を 0 に戻す
  4. workaround 完了後 unmount された listener は cleanup
- **目的:** 1e101 でブラウザによっては RangeError、`durationchange` の方が iOS Safari で確実

### FR-082-03: onError フィルタの厳密化（誤検知の根絶）
- **説明:** loadError = true にする条件を厳密化
- **新条件（AND 結合）:**
  - error.code が 2 (NETWORK) または 4 (SRC_NOT_SUPPORTED)
  - **かつ** `audio.readyState < 2` (HAVE_CURRENT_DATA 未満 = 実際にデータが取れていない)
  - **かつ** `audio.networkState === 3` (NO_SOURCE) もしくは `audio.error.code === 4`
- **コード 3 (DECODE) は無視**: seek workaround や transient decode で頻発するため
- **目的:** 「実際に再生できる音声に誤って失敗 UI が出る」を完全に防ぐ

### FR-082-04: ライブラリ依存の追加と SSR 対策
- **依存追加:** `fix-webm-duration` (^1.0.6)
- **使用箇所:** クライアントコンポーネント (`'use client'`) のみ
- **SSR セーフ:** 動的 import は不要（library 自体が browser 依存だが import 時には副作用無し）

---
