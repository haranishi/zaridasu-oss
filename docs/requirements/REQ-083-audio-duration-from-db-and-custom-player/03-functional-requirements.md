## 機能要件

### FR-083-01: posts.audio_duration_ms カラム追加
- **型:** `int NULL`
- **CHECK:** `audio_duration_ms IS NULL OR audio_duration_ms BETWEEN 0 AND 60000`（0〜60 秒、本番は 10 秒上限だが余裕を持たせる）
- **column-protection 拡張:** `protect_post_status` で user 直接更新を禁止（INSERT 時のみ許可）

### FR-083-02: usePostForm から保存
- `submitPost` の posts insert payload に `audio_duration_ms` を追加
- 値: AudioRecorder の onRecorded 第 3 引数

### FR-083-03: AudioPlayer をカスタム UI 化
- `<audio src controls preload="metadata">` を **`<audio src preload="metadata" hidden>` + 独自コントロール** に置き換え
- UI 構成:
  - 再生 / 一時停止ボタン (Lucide `Play` / `Pause`)
  - プログレスバー（クリック可能、scrub 可）
  - 現在時刻 / 合計時刻のテキスト（`0:03 / 0:06`）
  - 真のエラー時のみ「ファイルを開く」リンク（既存ロジック流用）
- 合計時刻のソース優先度:
  1. `audio.duration` が finite なら採用
  2. それ以外は props `durationMs` を ms→sec に変換して表示
  3. どちらも無ければ `--:--`

### FR-083-04: 既存呼び出し箇所の props 受け渡し
- AudioRecorder: 録音中の preview に `durationMs={durationMs}` を渡す
- MyPostsSection: post.audio_duration_ms を渡す
- DetailPage: 同上

### FR-083-05: 型定義更新
- `MyPost` 型 / `DetailPost` 型に `audio_duration_ms?: number | null` を追加

---
