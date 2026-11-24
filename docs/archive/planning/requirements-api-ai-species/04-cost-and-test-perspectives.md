## コスト試算

| シナリオ | 月間投稿数 | 月額 |
|---------|----------|------|
| 初期 | 100 件 | $0.04 |
| 成長期 | 1,000 件 | $0.40 |
| 拡大期 | 10,000 件 | $4.00 |

---

## テスト観点

1. `classify-species` Edge Function: JWT なし → 401、無効画像 → graceful エラー、正常画像 → JSON 返却
2. `useSpeciesClassifier`: loading 状態・成功・失敗のサイレント処理
3. PostForm: 写真なし時に AI バナーが表示されないこと
4. 「採用する」押下で種別セレクタが変わること
5. JSON バリデーション: `species` が `invalid` の場合に `unknown` になること
