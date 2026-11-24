# DB migration と本番デプロイの順序手順書

> 参照要件: REQ-298 (FR-298-04) / REQ-286 / REQ-282
> 所要時間: **5 分**（`supabase db push` と確認）

---

## いつ使うか

- CI の **`migration-gate` ジョブが赤くなった**とき
- `supabase/migrations/` に新しい `.sql` を追加した PR を **main へマージする前**
- 「本番に適用済みなのにリポジトリに無い migration がある」と言われたとき

---

## 主要な決定事項（要点）

- **DB migration の本番適用は人手**（CI に `supabase db push` は無い）。フロントの本番デプロイだけが CI 経由なので、放置すると「フロントが先・DB が後」の順序事故が起きる。
- **正しい順序は「migration を本番へ push してから PR をマージ」。** `supabase db push` はローカルの作業ツリーから適用するので、マージを待つ必要がない。
- **2026-08-03（REQ-298 FR-298-04）から `migration-gate` がこの順序を機械的に強制する。** 本番未適用の migration が 1 本でもあると main push で `deploy` が走らない。
- **適用済みの `.sql` は絶対に編集しない。** version が同じだと二度と流れず、リポジトリ／`schema.sql` と本番が乖離したまま CI は緑になる（実際に `20260513000014_...` で起きた事故。是正は `20260803000001`）。
- **`supabase/migrations/README.md` の本数表記も CI 検証対象**（REQ-286 FR-286-05）。更新漏れでゲートが赤いままになる。

## 各部品

- [01-why-order-matters.md](./migration-deploy-order/01-why-order-matters.md) — なぜ順序が要るのか（順序事故が起きる 4 ステップ、`migration-gate` による強制）と、正しい順序の図。
- [02-procedure.md](./migration-deploy-order/02-procedure.md) — 手順 1〜5（未適用の確認 / 適用前に中身と冪等性・破壊的操作を読む / `supabase db push` / 適用結果の確認 / 索引の更新）。実行コマンドを含む。
- [03-gate-red-and-forbidden.md](./migration-deploy-order/03-gate-red-and-forbidden.md) — `migration-gate` が赤いときの読み方（CI メッセージ別の意味と対処の表）と、絶対にやらないこと（適用済み migration の編集・過去の実例・内容ドリフト検知の仕組み）と関連リンク。
