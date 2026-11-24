## 6. 受入条件

- [ ] **AC-01**: `git status --porcelain` が空である
- [ ] **AC-02**: `git ls-files 'supabase/migrations/*.sql' | wc -l` と本番 `schema_migrations` の件数が一致する（現時点では 59）
- [ ] **AC-03**: `supabase/migrations/README.md` の本数表記・適用状況・索引テーブルの最終行が実体と一致する
- [ ] **AC-04**: 本番にのみ存在する migration がある状態を再現すると、main の CI が赤になる
- [ ] **AC-05**: リポジトリにのみ存在する（未適用）migration がある状態で、PR の CI が warning を出す
- [ ] **AC-06**: README の本数表記を実体とずらすと CI が fail する
- [ ] **AC-07**: clone 直後のリポジトリから構築した環境に、旧トリガー `analyze-image-on-insert` が存在しない

---

## 7. 未確定事項（実装着手前に決める）

| # | 論点 | 選択肢 | 決定 |
|---|---|---|---|
| 1 | FR-286-04 の実装手段 | A. `supabase migration list` の出力を解釈 / B. Management API へ直接 SQL を投げる | 未定 |
| 2 | 検知を既存 `edge-functions-deploy-lag` ジョブに相乗りさせるか、別ジョブにするか | A. 相乗り（secrets 取得が 1 回で済む） / B. 別ジョブ（責務分離） | 未定 |
| 3 | 索引の検証を本数のみとするか、索引行と実ファイル名の完全突合まで行うか | A. 本数のみ / B. ファイル名の完全突合 | 未定 |

---
