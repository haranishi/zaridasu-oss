## サマリー

### 真因
**Chromium バグ**: MediaRecorder が webm を出力する際 Duration メタデータを container に書かない。直すための upstream fix は WontFix。

### 対策
- **クライアント側で blob を post-process** してから upload。`fix-webm-duration` が EBML を解析して Duration 要素を書き込む。
- **AudioPlayer の onError を厳密化**して、実際は再生可能な音声で誤って失敗 UI を出さない。
- **seek workaround を堅牢化**して、古い patch なし音声にも極力対応する。

### 工数
合計 30 分〜1 時間。ライブラリは 2 KB gzipped で増加。
