## 要件概要

### 背景・目的
ザリダス（kenkyuu-app）の AI 判定機能は、posts INSERT/UPDATE トリガー（`supabase/migrations/20260421000001_ai_analysis_webhooks.sql`）から `analyze-image` / `analyze-audio` Edge Function を呼び出し、Gemini API を利用して種判定・自動承認/リジェクトを行っている。

現状は **全投稿に対して画像 1 回 + 音声 1 回（最大）** の API 呼び出しが発生しており、投稿数増加とともに月額 Gemini API 料金が線形に増加する見込み。本要件は **精度を維持しつつ API コストを段階的に削減** することを目的とする。

**目標削減率（累積）**: 現状コストを 1 とした場合、**最終的に 0.10 〜 0.15 倍**（80〜90% 減）まで圧縮することを目指す。

### スコープ
**含む:**
- `supabase/functions/analyze-image/index.ts` の Gemini モデル選定・入力削減
- `supabase/functions/analyze-audio/index.ts` の Gemini モデル選定・入力削減
- `src/components/features/posts/AudioRecorder.tsx` および画像アップロード周りのクライアント側ゲート
- 評価基盤（CLI スクリプト、フィクスチャ、コストダッシュボード）の整備
- DB スキーマ変更（`audio_hash` / `image_hash` カラム追加 等、Phase 4 のみ）
- DB トリガーの再判定 rate limit ロジック

**含まない（対象外）:**
- AI 判定**精度の向上**そのもの（別要件として REQ-XXX で定義予定）
- 画像/音声の Storage バケット運用見直し（既に REQ-070 で定義済み）
- 自動承認/リジェクトの**運用ポリシー変更**（閾値そのものの再キャリブレーションは Phase 0 のスコープに含むが、ポリシー設計の変更は別要件）

### 前提条件・制約
- **技術スタック**: Next.js 15 App Router + React 19 + Supabase（@supabase/ssr, Edge Functions Deno, Storage, pg_net）
- **Gemini モデル現状**:
  - `analyze-image`: `gemini-3.1-flash-lite-preview`（ハードコード）
  - `analyze-audio`: `gemini-2.5-flash`（環境変数 `GEMINI_AUDIO_MODEL` で上書き可）
- **既存冪等性**: `ai_result.audio_analysis.analyzed_at` または `ai_result.analyzed_at` が存在する場合スキップする実装は既にある
- **音声制約（既存）**: 最大 10 秒・1MB（`AudioRecorder.tsx`、post-audio bucket）
- **自動承認/リジェクト閾値（既存）**:
  - `AUTO_APPROVE_BOTH = 0.75`（画像+音声の両方ある場合）
  - `AUTO_APPROVE_AUDIO_ONLY = 0.85`（音声のみ）
  - `AUTO_REJECT_CONFIDENCE = 0.70`
- **重要制約**: **精度低下の評価無しに Phase 1 のモデル切り替えを進めることは禁止** → Phase 0（評価基盤）が全 Phase の前提依存

---
