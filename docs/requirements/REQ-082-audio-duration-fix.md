# REQ-082: 音声 duration 不正表示の根治と再生時誤検知の解消

> **作成日**: 2026-04-25
> **ステータス**: TODO
> **関連要件**: REQ-069 / REQ-070 / REQ-080 / REQ-081
> **優先度**: 🔴 P0（音声機能の体感品質を著しく損なう）

---

## これは何か

録音した音声が `0:00 / 0:00` と表示され再生バーが操作できない問題と、**正常に再生できる音声にまで「音声の読み込みに失敗しました」が出る誤検知**を根治するための要件定義。本文は下記の部品ファイルに逐語のまま分割してある。

## 目的・背景の要約

真因は **Chromium の既知バグ**で、`MediaRecorder` が webm container に Duration メタデータを書かないこと（chromium#642012 は WontFix）。録音中に header を書き出す時点で総時間が不明なうえ、停止時に書き戻す処理は仕様上要求されていない。結果として `<audio>` の `duration` が `Infinity` になり、`0:00 / 0:00` 表示・再生バー無効になる。既存の seek-to-1e101 workaround は Chrome では効くが Firefox / iOS Safari では効かず、しかも `MEDIA_ERR_DECODE` を誘発してエラー UI を誤発火させていた。録音はできるのに UI が壊れて見える状態で、信頼性を損なう。

## 主要な決定事項の要点

- **クライアント側で blob を post-process してから upload する。** `fix-webm-duration`（MIT・2KB gzipped・zero deps）で EBML を解析し Duration 要素を書き込む。webm 系のみ対象で、mp4/mp3 は素通し。
- **fail-soft を徹底する。** ライブラリ内の例外は捕捉して元 blob を使い、**投稿フローを止めない**。
- **onError の判定を AND 条件で厳密化する。** error.code 2/4 かつ `readyState < 2` かつ `networkState === 3`（または code 4）。**コード 3（DECODE）は無視**する（seek workaround で頻発するため）。
- **seek workaround は `Number.MAX_SAFE_INTEGER` + `durationchange` 監視へ置換。** 1e101 はブラウザによって RangeError になり、`durationchange` のほうが iOS Safari で確実。
- **既存の保存済み音声は bulk 再書き出しをしない。** seek workaround の現状維持で吸収する。server-side ffprobe 抽出と `posts.audio_duration_ms` カラム追加は今回のスコープ外（DB 変更なし）。
- **工数は合計 30 分〜1 時間**、バンドル増は約 2KB gzipped。

## 各部品

| ファイル | 内容 |
|---|---|
| [01-overview.md](REQ-082-audio-duration-fix/01-overview.md) | 要件概要（背景・目的／確定した根本原因と upstream issue 群／スコープの含む・含まない／前提条件・制約） |
| [02-user-stories.md](REQ-082-audio-duration-fix/02-user-stories.md) | US-082-01〜03（録音直後の長さ確認・マイページ表示・バンドルサイズ）と各受け入れ条件 |
| [03-functional-requirements.md](REQ-082-audio-duration-fix/03-functional-requirements.md) | FR-082-01〜04（duration patch・AudioPlayer workaround 改良・onError フィルタ厳密化・依存追加と SSR 対策） |
| [04-non-functional-requirements.md](REQ-082-audio-duration-fix/04-non-functional-requirements.md) | 非機能要件（パフォーマンス／バンドルサイズ／互換性／信頼性／セキュリティ） |
| [05-impact-and-acceptance.md](REQ-082-audio-duration-fix/05-impact-and-acceptance.md) | 影響範囲（変更ファイル表・DB/API は変更なし）と受け入れ基準 AC-082-01〜07 |
| [06-risks-and-plan.md](REQ-082-audio-duration-fix/06-risks-and-plan.md) | リスク・トレードオフ5件の緩和策と、実装優先度と計画（P0〜P3） |
| [07-summary.md](REQ-082-audio-duration-fix/07-summary.md) | サマリー（真因・対策・工数） |
