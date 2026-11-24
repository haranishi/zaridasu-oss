## 影響範囲

### コード変更
| ファイル | 変更内容 |
|---|---|
| `package.json` | `fix-webm-duration` 依存追加 |
| `src/lib/audio/fixWebmDuration.ts`（新規） | ライブラリのラッパ（mime 判定 + fail-soft） |
| `src/components/features/posts/AudioRecorder.tsx` | `recorder.onstop` で patch 適用 |
| `src/lib/uploadAudio.ts`（任意） | 多重防御として upload 時にも patch をかける（録音以外の経路もカバー） |
| `src/components/ui/AudioPlayer.tsx` | seek 値を MAX_SAFE_INTEGER に、durationchange 監視追加、onError フィルタ強化 |

### DB / API / Storage / マイグレーション
変更なし。

---

## 受け入れ基準

| ID | 受け入れ基準 |
|---|---|
| AC-082-01 | 録音直後の preview audio で `5.0 秒` のように duration が表示される |
| AC-082-02 | マイページの音声付き投稿カードで duration が表示される |
| AC-082-03 | 「音声の読み込みに失敗しました」が、再生可能な音声に対して**表示されない** |
| AC-082-04 | 真にネットワーク失敗 / 不正 URL の場合のみフォールバック表示 |
| AC-082-05 | iOS Safari 実機で AC-082-01 と AC-082-03 が成立 |
| AC-082-06 | next build に成功し、First Load JS の増加が 10KB 以内 |
| AC-082-07 | 既存テスト 261 件が通る |

---
