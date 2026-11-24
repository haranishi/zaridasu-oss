## 影響範囲

### コード変更
| ファイル | 変更内容 |
|---|---|
| `supabase/functions/analyze-audio/index.ts:35` | デフォルトモデル変更（最小変更） |
| `supabase/functions/analyze-image/index.ts:29` | 環境変数化、デフォルト変更 |
| `supabase/functions/analyze-audio/index.ts:39-42`（オプション） | 閾値定数の env 化 |
| `supabase/functions/analyze-image/index.ts:39-42`（オプション） | 同上 |

### 環境変数追加
| 変数名 | デフォルト | 説明 |
|---|---|---|
| `GEMINI_IMAGE_MODEL` | `gemini-2.5-flash-lite`（要確認） | 画像判定モデル |
| `AI_AUTO_APPROVE_BOTH`（任意） | `0.75` | 両モダリティある場合の自動承認閾値 |
| `AI_AUTO_APPROVE_AUDIO_ONLY`（任意） | `0.85` | 音声のみの場合の自動承認閾値 |
| `AI_AUTO_REJECT_CONFIDENCE`（任意） | `0.70` | 自動却下閾値 |

### DB スキーマ変更
- なし

### ドキュメント追加
- `docs/runbooks/ai-model-rollback.md`（新規）
- `reports/phase1-ab/<date>.md`（評価レポート）

---

## API 仕様
変更なし（Edge Function の入出力スキーマは既存と互換）。

## 画面仕様
変更なし。

## データモデル・DB 設計
変更なし。

---
