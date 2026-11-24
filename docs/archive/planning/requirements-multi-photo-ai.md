> ⚠️ **アーカイブ（2026-07-18 / REQ-282 FR-282-B4）**: 歴史的文書（当時のスナップショット）。以後更新しない。現況は `docs/requirements/` の REQ 文書とインデックスを参照。

# 要件定義: AI-002 写真複数枚AI判定

- **ID**: AI-002
- **優先度**: 🟠 中（判定精度向上に直結）
- **対象ファイル**: `supabase/functions/analyze-image/index.ts`, `src/hooks/usePostForm.ts`, 関連UI
- **作成日**: 2026-03-20

---

## これは何か

1 枚目の写真しか AI 判定していなかった仕様を、投稿された最大 3 枚すべてを解析して統合する形に拡張するための要件定義書（AI-002）。長いため機能要件 F1〜F5 の境界で分割し、本文は `requirements-multi-photo-ai/` 配下へ逐語で移した。

## 目的・背景の要約

`analyze-image/index.ts` は `record.photos[0]` のみを Gemini API に渡しており、2 枚目以降は完全に無視されていた。そのため 1 枚目がぼやけていてもリカバリできず、confidence が 1 枚の撮影条件（角度・照明）に左右され、複数枚投稿のインセンティブも弱かった。全写真を判定して最も信頼度の高い結果を採用し、判定の透明性（どの写真がどう判定されたか）も確保するのが目的。

## 主要な決定事項（要点）

- Edge Function で **最大 3 枚を並列解析**し、結果を aggregate して統合する。`Promise.all` ではなく **`Promise.allSettled`** を使い、1 枚失敗しても他は処理を続ける（1 枚でも成功すれば結果を返す）。
- `ai_result` の**トップレベルキーは変更せず** `per_photo` を追加するだけにして後方互換を保つ。既存フロントエンドは修正不要で動作し、`per_photo` が undefined の場合はフォールバック表示する。
- **自動承認ロジックは変更不要**（統合結果のトップレベル値で判定するため）。GAME-001 の `ai_perfect` バッジも per_photo の最高値ではなく統合値で判定する。
- 性能・コストの上限は、応答時間 3 枚並列で 15 秒未満、全体タイムアウト 45 秒／個別 30 秒、Gemini API 呼び出し最大 3 回/投稿（月間 100 投稿想定で無料枠内）。
- 実装は Phase A（Edge Function 並列解析＋aggregate）→ B（`per_photo` 追加）→ C（DetailPage 表示）→ D（審査画面表示）→ E（再分析フロー確認）の順。

## 分割ファイル

- [01-issues-and-user-stories.md](requirements-multi-photo-ai/01-issues-and-user-stories.md) — 現状の課題とユーザーストーリー US1〜US4、機能要件の入口
- [02-f1-multi-photo-analysis.md](requirements-multi-photo-ai/02-f1-multi-photo-analysis.md) — F1 複数枚解析ロジック（Edge Function の並列処理と統合ルール）
- [03-f2-ai-result-schema.md](requirements-multi-photo-ai/03-f2-ai-result-schema.md) — F2 `ai_result` スキーマ拡張（`per_photo` の構造）
- [04-f3-f5-auto-approval-ui-reanalysis.md](requirements-multi-photo-ai/04-f3-f5-auto-approval-ui-reanalysis.md) — F3 自動承認ロジックの更新／F4 フロントエンド表示の拡張／F5 再分析対応
- [05-nonfunctional-edge-function-and-phases.md](requirements-multi-photo-ai/05-nonfunctional-edge-function-and-phases.md) — 非機能要件、Edge Function の変更箇所 3 点、画面遷移、実装フェーズ、依存・注意事項
