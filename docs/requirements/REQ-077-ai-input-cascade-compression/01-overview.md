## 要件概要

### 背景・目的
現状、無音や極端なブレ写真でも投稿が成立し、Gemini API が呼ばれてしまう。また音声・画像は **本番アップロードサイズのまま** Edge Function から Gemini に送信されており、入力トークン量が大きい。

本要件では:
1. **クライアント側で「明らかにダメな入力」を投稿前に弾く**（API 呼び出し回数削減）
2. **AI 判定用に縮小・圧縮した派生バリアントを別途生成**して送信（入力トークン削減）

### スコープ
**含む:**
- `AudioRecorder.tsx` の AnalyserNode 拡張による無音/低音量/秒数チェック
- 画像アップロード時の解像度・blur 検出（Laplacian variance）
- 音声の事前圧縮（48k → 16k mono、Opus 32kbps）
- 画像の事前圧縮（長辺 1024px、JPEG q=85）
- AI 判定用バリアントを Storage の別 path（or 別 bucket）に保存
- Edge Function 側で AI バリアントを優先 fetch するロジック
- フィーチャーフラグ `AI_INPUT_COMPRESSION_ENABLED` による段階ロールアウト

**含まない:**
- 元データ（高解像度・非圧縮）の保存方針変更（既存 bucket そのまま）
- AI モデルの変更（Phase 1）

### 前提条件・制約
- `AudioRecorder.tsx` は既に AnalyserNode を起動中（visualizer 用）→ 音声特性計算で再利用
- 既存 post-audio bucket 上限: 1MB
- 既存 post-photos bucket 上限: 要確認（schema 参照）
- クライアント圧縮は **モバイル端末でも 3 秒以内** に完了すること
- ゲート判定は **強制弾きではなく警告のみ**（誤検知時のユーザー救済）

---
