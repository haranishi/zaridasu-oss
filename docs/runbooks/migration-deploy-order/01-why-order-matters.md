## なぜ順序が要るのか

このリポジトリの CI には **`supabase db push` が無い**。DB migration の本番適用は**人手**である
（`vercel.json` の `git.deploymentEnabled` を無効化しているため、フロントの本番デプロイは CI のみ）。

そのため何もしないと、次の順序事故が起きる。

1. 「新しいカラムを読むフロントエンド」と「そのカラムを追加する migration」を同じ PR でマージする
2. CI が Vercel へ本番デプロイする（フロントだけ先に本番へ出る）
3. migration は手動なので、まだ本番 DB にカラムが無い
4. 本番のフロントが存在しないカラムを読んで壊れる

**2026-08-03（REQ-298 FR-298-04）から、`migration-gate` ジョブがこの順序を機械的に強制する。**
本番未適用の migration が 1 本でもあると、main push で `deploy` ジョブが実行されない。

## 正しい順序

```
feat ブランチで migration を書く
  → ローカル / ステージングで検証
  → ★ supabase db push（本番へ適用）        ← ここが先
  → PR を develop / main へマージ
  → CI の migration-gate が緑 → deploy が走る
```

**マージ前に push する**のがポイント。`supabase db push` はローカルの作業ツリーから適用するので、
マージを待つ必要はない。
