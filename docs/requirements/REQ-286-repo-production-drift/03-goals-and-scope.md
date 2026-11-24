## 3. 目的

1. 未追跡ファイルを解消し、リポジトリから本番を再現できる状態に戻す
2. migration 索引を実体と一致させ、索引としての信頼性を回復する
3. 「本番にあるがリポジトリに無い migration」「リポジトリにあるが本番に無い migration」を**機械的に検知**する
4. 要件定義文書が未コミットのまま滞留しない運用にする

---

## 4. スコープ外

- migration の from-scratch 再適用性の是正（`supabase db reset` が 2 本目で失敗する既知問題）— **REQ-281 FR-281-01** の範囲
- `schema.sql` と migrations の等価性検証（pg_dump 正規化 diff）— 同じく REQ-281 FR-281-01
- 適用済み migration の統合・改名・削除（README の運用ルールで明確に禁止されている）
- `private` スキーマを schema.sql へ取り込む方針変更（D のとおり現行方針を維持する）

---
