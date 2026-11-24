## 影響範囲

### コード変更
| ファイル | 変更内容 |
|---|---|
| `src/components/features/posts/AudioRecorder.tsx` | RMS チェック、長さチェック、Opus 圧縮 |
| `src/components/features/posts/PostForm.tsx` | 画像 blur/解像度チェック、画像圧縮 |
| `src/lib/uploadAudio.ts` | AI バリアントの追加アップロード |
| `src/lib/uploadPhoto.ts`（既存パスは要確認） | 同上 |
| `src/hooks/usePostForm.ts` | 圧縮フローの組み込み |
| `supabase/functions/analyze-audio/index.ts` | AI バリアント優先 fetch |
| `supabase/functions/analyze-image/index.ts` | 同上 |

### 新規ファイル
| ファイル | 用途 |
|---|---|
| `src/lib/audio/compressOpus.ts`（新規） | Opus 圧縮ユーティリティ |
| `src/lib/audio/silenceDetect.ts`（新規） | RMS 計算 |
| `src/lib/image/compressJpeg.ts`（新規） | 画像リサイズ |
| `src/lib/image/blurDetect.ts`（新規） | Laplacian variance 計算 |

### 環境変数追加
| 変数名 | デフォルト | 説明 |
|---|---|---|
| `NEXT_PUBLIC_AI_INPUT_COMPRESSION_ENABLED` | `false` | クライアント圧縮の有効化フラグ |
| `AI_INPUT_COMPRESSION_ENABLED` | `false` | Edge Function 側の AI バリアント優先 fetch フラグ |
| `AI_SILENCE_THRESHOLD_DBFS` | `-45` | 無音判定の閾値（dBFS） |
| `AI_BLUR_THRESHOLD` | `100` | blur 判定の閾値（Laplacian variance） |

### Storage 構造変更
- post-audio: `{post_id}.ai.opus` を新規 path として運用（bucket policy は既存と同じ）
- post-photos: `{post_id}/{n}.ai.jpg` を新規 path として運用

### 依存関係追加
- 音声 Opus エンコード: 候補ライブラリ
  - `opus-recorder`（軽量、~30KB）
  - `@ffmpeg/ffmpeg.wasm`（高機能だが ~25MB）
  - 推奨: `opus-recorder`
- 画像処理: ブラウザ標準 Canvas API のみで完結（追加不要）

---
