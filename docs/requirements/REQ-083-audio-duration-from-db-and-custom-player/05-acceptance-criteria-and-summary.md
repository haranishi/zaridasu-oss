## 受け入れ基準

| ID | 受け入れ基準 |
|---|---|
| AC-083-01 | 新規録音 → preview に正しい duration 表示 |
| AC-083-02 | 投稿後マイページで正しい duration 表示 |
| AC-083-03 | 「音声の読み込みに失敗しました」が**実再生不可時のみ**表示 |
| AC-083-04 | 既存（duration_ms NULL）投稿でも `<audio>.duration` から表示できれば表示、不可でも再生は動く |
| AC-083-05 | tsc / vitest / next build 緑 |
| AC-083-06 | column-protection で user による audio_duration_ms 改竄が不可 |

---

## サマリー

ファイルメタデータの不備に振り回されないよう **DB に duration を保存し、再生 UI 側で確実に表示する** 構成へ移行する。`<audio>` の native UI を捨て、自前の小さな player に差し替えることで、ブラウザや webm container の不備に依存しない描画を保証する。

工数: 1〜2 時間。
