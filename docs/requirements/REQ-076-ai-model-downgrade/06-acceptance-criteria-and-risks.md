## 受け入れ基準

| ID | 受け入れ基準 |
|---|---|
| AC-076-01 | A/B 評価レポートが `reports/phase1-ab/` に存在し、各候補モデルの精度・コスト・レイテンシが比較されている |
| AC-076-02 | 切替後の precision / recall が許容範囲内（REQ-074 AC-074-05 を満たす） |
| AC-076-03 | `analyze-image` の preview 依存が解消されている（grep で `preview` を含むモデル名がハードコードされていない） |
| AC-076-04 | `docs/runbooks/ai-model-rollback.md` が存在し、5 分以内にロールバック可能な手順が記載されている |
| AC-076-05 | 切替後 7 日間の manual review 件数が施策前比 +10% 以内に収まっている |
| AC-076-06 | 月額 Gemini API コストが切替前比 **-50% 以上** 削減されている（30 日経過時点） |

---

## リスク・トレードオフ

| リスク | 影響 | 緩和策 |
|---|---|---|
| Lite モデルが音声入力非対応 | analyze-audio 切替不可 | 切替前に Gemini API ドキュメントで音声入力対応モデルを確認。非対応なら Flash 維持 + Phase 2/3 でコスト削減 |
| 精度が許容範囲を超えて低下 | 自動承認の品質悪化、手動 review 負荷増 | 即 rollback、または閾値再キャリブレーションで吸収 |
| `gemini-2.5-flash-lite` がまだ GA でない場合 | 別の preview リスクに移るだけ | GA 版確認、なければ `gemini-1.5-flash-8b` 等の確実な GA モデルを選定 |
| 切替前後でログのモデル名混在 | コスト集計が複雑化 | 切替日時を `docs/runbooks/ai-model-rollback.md` に明記、集計時にフィルタ可能に |

---
