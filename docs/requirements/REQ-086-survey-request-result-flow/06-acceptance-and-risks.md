## 受け入れ基準

| ID | 受け入れ基準 |
|---|---|
| AC-086-01 | 詳細ページの「調査結果を投稿する」から作成された posts に必ず `survey_request_id` が入る |
| AC-086-02 | 親の status が `open` から `responded` に自動遷移する |
| AC-086-03 | 親の status が `closed` の場合は変更されない |
| AC-086-04 | バナーから「紐付けを解除」すると通常投稿として処理される |
| AC-086-05 | 「依頼を見る」リンクは新タブで開き、戻ったときフォーム state が保持される |
| AC-086-06 | 既存 posts INSERT 経路（survey_request_id 無し）で挙動不変 |
| AC-086-07 | バックフィル SQL 実行後、過去の posts 紐付けが status に反映される |
| AC-086-08 | RLS / restrict_user_columns テスト群が引き続き通る |

---

## リスク・トレードオフ

| リスク | 緩和策 |
|---|---|
| トリガーが SECURITY DEFINER で意図しない権限昇格 | UPDATE 対象列を status のみに限定、WHERE 条件で open 限定 |
| クエリ引き継ぎが reload で消える | localStorage に短時間（10 分 TTL）保持する案を併用検討 |
| status 遷移後、結果投稿が rejected された場合の整合性 | 初期版では responded のまま。次フェーズで AI 自動却下時の挙動を再検討 |
| クエリ操作で他人の依頼 ID を強制紐付け | 詳細ページから来たかをサーバ側で再検証する余地、ただし FK 制約で実在性は担保済み |
| HomePage 経由でモーダル化することで深い URL パス共有が困難 | 専用ルート `/post/new?surveyRequest=<id>` を将来的に追加検討 |

---
