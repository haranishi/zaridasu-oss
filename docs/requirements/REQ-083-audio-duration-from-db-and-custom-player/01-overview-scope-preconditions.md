## 要件概要

### 背景・目的
REQ-082 で `fix-webm-duration` ライブラリで blob の duration metadata を埋める手法を採用したが、production で確認したところ依然として inline `<audio controls>` が `0:00 / 0:00` を表示している。原因として:
- ライブラリが特定の webm 出力で Duration 要素を書き込めていない可能性
- 既存音声（patch 前にアップロードされたもの）には効果が及ばない
- そもそも native `<audio>` の duration 表示は file metadata 依存で fragile

ファイル形式に関係なく **DB 由来の確定値で duration を表示する** ことで根治する。

### スコープ
**含む:**
- `posts.audio_duration_ms` カラム追加（録音時に算出済みの値を永続化）
- 投稿時に audio_duration_ms を DB に保存
- AudioPlayer をカスタム UI に差し替え（再生本体は `<audio>` 続投、表示は props 由来）
- 既存 `fix-webm-duration` patch は defense-in-depth として残す

**含まない:**
- 既存 audio_duration_ms 未設定投稿のバックフィル（NULL のまま許容）
- 完全な scrub/seek サポート（最低限の play/pause + progress + 時間表示）

### 前提条件
- 投稿時に `durationMs` は既に AudioRecorder 経由で取得済み（onRecorded 引数）
- post-audio bucket はそのまま使用、ファイル形式は変更なし

---
