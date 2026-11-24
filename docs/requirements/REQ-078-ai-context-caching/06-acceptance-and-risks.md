## 受け入れ基準

| ID | 受け入れ基準 |
|---|---|
| AC-078-01 | `ai_cache_registry` テーブルが作成され、Edge Function 初回起動時に cache が登録される |
| AC-078-02 | 通常運用時の cache hit 率 ≥ 90%（30 日経過時点） |
| AC-078-03 | Cache miss / API エラー時にも判定処理が成功する |
| AC-078-04 | TTL 切れ前の自動 refresh が動作（手動介入なしで運用継続） |
| AC-078-05 | 入力トークン量が施策前比 **-50% 以上**（cache hit 時の合算実効値） |
| AC-078-06 | フィーチャーフラグ off 時は既存挙動と完全互換 |

---

## リスク・トレードオフ

| リスク | 影響 | 緩和策 |
|---|---|---|
| 最低トークン数を満たせずキャッシュ作成不可 | Phase 3 効果ゼロ | 参照音声/画像を Few-Shot 同梱して底上げ（精度向上要件と統合） |
| キャッシュ保存料金が想定より高い | 削減効果が削られる | 月次コストレポートで監視、TTL 短縮 or 削除 |
| TTL 自動 refresh のレースコンディション | 一時的に cache miss 増 | UPSERT で吸収、refresh 中に複数 Edge Function インスタンスが同時 refresh しても害なし |
| Gemini API 仕様変更で Cached Content が deprecate | 突然動作不能 | フィーチャーフラグで即時 off 可能 |
| モデル切替時の cache 不整合 | 古いモデル用 cache を新モデルで使ってエラー | `function_name + model` ユニーク制約で別レコード化 |

---
