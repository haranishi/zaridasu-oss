## 受け入れ基準

| ID | 受け入れ基準 |
|---|---|
| AC-079-01 | 新規投稿で audio_hash / image_hashes が DB に保存される |
| AC-079-02 | 同一 hash の過去判定結果が再利用される（dedup hit ログで確認） |
| AC-079-03 | reanalysis 4 回目で 429 が返り、エラーメッセージが UI に表示される |
| AC-079-04 | 既存投稿（hash NULL）に対する判定処理は従来通り動作 |
| AC-079-05 | column-protection trigger により user が直接 hash カラムを書き換えられない |
| AC-079-06 | dedup ロジック失敗時に通常処理にフォールバックし、判定が完了する |

---

## リスク・トレードオフ

| リスク | 影響 | 緩和策 |
|---|---|---|
| ハッシュ衝突（極めて稀） | 別物が同じ判定結果に | SHA-256 は実用上衝突なし。気になればファイルサイズも併用 |
| dedup により誤った過去判定が伝播 | 同一音声でも文脈（位置/季節）が違えば誤判定の可能性 | dedup は audio/image 単独の判定のみ再利用。combined_decision は再計算 |
| rate limit が厳しすぎてレビュー業務に支障 | 管理者の手動再判定も制限される | admin 経由（service_role）の reanalysis は rate limit 対象外にする |
| バックフィルなしでは効果が出るまで時間かかる | 効果が即現れない | 必要に応じて hash 後付けジョブを追加（optional） |
| RLS 拡張漏れで user が hash を改竄 | 不正な dedup 利用 | column-protection を必ずテストで検証（REQ-048 拡張） |

---
