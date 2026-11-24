## 要件概要

### 背景・目的
現状の AI 判定 Edge Function のモデル選定:

| Function | 現行モデル | 課題 |
|---|---|---|
| `analyze-audio` | `gemini-2.5-flash`（環境変数で上書き可） | 高機能だが高コスト。Lite 系で十分な可能性 |
| `analyze-image` | `gemini-3.1-flash-lite-preview`（**ハードコード**） | 既に Lite 系だが **preview** 依存。提供終了リスク |

本要件では:
1. `analyze-audio` を **Gemini 2.5 Flash-Lite**（または同等以下）へ評価ベースで切り替え
2. `analyze-image` の **preview 依存を解消**（GA 版モデル + 環境変数化）
3. モデル切替に伴う **自動承認/リジェクト閾値の再キャリブレーション**

### スコープ
**含む:**
- `analyze-audio/index.ts` のデフォルトモデル変更
- `analyze-image/index.ts` のモデル設定の環境変数化（`GEMINI_IMAGE_MODEL`）
- Phase 0 で整備したスクリプトを使った A/B 評価
- 必要に応じた `AUTO_APPROVE_BOTH` / `AUTO_APPROVE_AUDIO_ONLY` / `AUTO_REJECT_CONFIDENCE` の再キャリブレーション
- ステージング環境での実投稿シャドウラン（オプション）

**含まない:**
- プロンプト本体の変更（精度向上は別要件）
- 入力データの圧縮（Phase 2）
- Context Caching（Phase 3）

### 前提条件・制約
- **REQ-075 完了が必須** — 評価基盤無しでの切り替えは禁止
- 切り替えは **環境変数のみで制御**できること（コードデプロイ無しで rollback 可能）
- Gemini Flash-Lite 系が **音声入力をサポート**していることを要確認（TBD）
- Phase 0 で確立する許容精度低下幅（recall -3pt, precision -2pt 以内）を満たすこと

---
