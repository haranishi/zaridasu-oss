## 非機能要件

### パフォーマンス
- duration patch の処理時間: **モバイルでも 200ms 以内**（10 秒・1MB 音声の場合）
- patch 中の UI ブロックを避けるため非同期実行（`recorder.onstop` 内で `await`）

### バンドルサイズ
- `fix-webm-duration` は ~2 KB gzipped、Next.js の bundle size に許容範囲

### 互換性
- Chrome / Edge / Firefox / Safari macOS / iOS Safari / 主要 Android Chrome
- patch が失敗しても投稿フローは継続（fail-soft）

### 信頼性
- ライブラリ内例外を try-catch で捕捉
- 既存音声（patch 適用前のもの）でも再生可能（seek workaround で吸収）

### セキュリティ
- 追加 dep の license: MIT （OSS 互換）
- ライブラリは純粋なバイナリ操作のみで外部通信なし

---
