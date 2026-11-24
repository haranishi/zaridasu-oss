## 要件概要

### 背景・目的
マイク権限問題（REQ-081）を解決し録音は可能になったが、以下 2 つのプレビュー問題が残存:

1. **投稿フォーム上**: 録音直後の `<audio>` プレビューが `0:00 / 0:00` を表示し再生バーが操作できない
2. **マイページ投稿一覧**: 投稿済み音声カードでも `0:00 / 0:00` 表示、加えて「音声の読み込みに失敗しました。ファイルを開く」フォールバックメッセージが**正常に再生できる音声に対しても**表示される

ユーザー体験上「録音はできるが UI 上は壊れて見える」状態であり、信頼性を損なう。

### 確定した根本原因

**Chrome `MediaRecorder` の webm container に duration metadata が書かれない** Chromium 既知バグ:
- Issue: [chromium#642012 "MediaRecorder: consider producing seekable WebM files"](https://bugs.chromium.org/p/chromium/issues/detail?id=642012) — WontFix
- Issue: [chromium#40626247 "MediaRecorder file not contain duration"](https://issues.chromium.org/issues/40626247) — Open
- W3C 仕様議論: [mediacapture-record#119](https://github.com/w3c/mediacapture-record/issues/119)

`MediaRecorder` は録音中に header を書き出すが、その時点では総時間が不明なので Duration 要素を書かない。録音停止時に書き戻す処理は仕様上要求されておらず Chromium も実装していない。結果:

- `<audio>` 要素は `duration === Infinity` を返す
- `<audio controls>` は `0:00 / 0:00` 表示で再生バー無効
- seek-to-1e101 workaround は **Chrome では動くが Firefox / iOS Safari では動かない**
- seek workaround が `MEDIA_ERR_DECODE` を引き起こすケースもあり、エラー UI が誤発火

### スコープ
**含む:**
- 録音直後の blob に **client-side duration patch** を適用してから upload
- AudioPlayer の再生 workaround を改良（Number.MAX_SAFE_INTEGER + durationchange 監視）
- onError のフィルタ強化: workaround 中 / 既に再生可能状態のエラーを誤検知扱いしない
- 既に保存済みの古い音声（duration 無し）は seek workaround の現状維持で吸収

**含まない:**
- 既存音声ファイルの bulk 再書き出し
- Server-side ffprobe による duration 抽出（将来要件として保留）
- DB の posts.audio_duration_ms カラム追加（今回はクライアントだけで完結）

### 前提条件・制約
- 利用ライブラリ: `fix-webm-duration` (yusitnikov / MIT / 2 KB gzipped / zero deps)
- 対応ブラウザ: Chrome / Edge / Firefox / Safari（macOS / iOS） / 主要 Android
- 録音 MIME は `audio/webm;codecs=opus` / `audio/webm` / `audio/mp4` / `audio/mpeg`（既存維持）
- patch 対象は webm 系のみ。それ以外（mp4 / mp3）はライブラリスキップで blob をそのまま使う

---
