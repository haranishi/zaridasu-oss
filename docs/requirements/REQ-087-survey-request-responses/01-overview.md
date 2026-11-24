## 要件概要

### 背景・目的
現在の調査依頼に対して可能なアクションは **「結果投稿（重い）」または「無視（何もしない）」の二択**しかない。実際には「すぐ調査には行けないが、見守り / 関心表明をしたい」中間アクションのニーズが大きい。

`survey_requests` テーブルに `response_count INTEGER NOT NULL DEFAULT 0` が **既に存在しているが完全に未使用**である。本要件は:

- 軽量な「協力する」アクションを追加し、中間関与を可能にする
- `response_count` を活用するか、より柔軟な `survey_request_responses` テーブルを新設する
- 重複応答防止 / レート制限 / 応答取消し / 応答者一覧 UI を整備する

### スコープ
**含む:**
- `survey_request_responses` テーブル新設（推奨案、後述リスク表で検討）
- 詳細ページに「協力する」ボタン + 応答数 + 応答者一覧
- 重複応答防止（DB unique 制約）
- 応答取消し（自分の応答のみ DELETE 可）
- レート制限（1 ユーザー 24h あたり 20 応答まで）
- `response_count` の自動更新トリガー（INSERT/DELETE で増減）
- マイページに「自分が応答した依頼一覧」リンク（任意）

**含まない:**
- 応答に伴う通知 → REQ-088 で扱う
- 応答メッセージ（テキストコメント） → REQ-089 のコメント直結化で扱う
- 応答数バッジ（ゲーミフィケーション） → 別要件

### 前提条件・制約
- 既存 `survey_requests.response_count` カラムは保持し、トリガーで実応答数と同期させる
- 応答者の identity は `user_id`。匿名応答は許可しない（重複防止が崩れるため）
- closed な依頼への応答は不可（DB CHECK ではなく RLS / アプリ層で禁止）

### テーブル設計案の比較

| 案 | 概要 | 推奨度 |
|---|---|---|
| A: `response_count` だけインクリメント | 既存カラムの `update` のみ | × 重複防止 / 応答者一覧不可 |
| B: `survey_request_responses` 新設 | (request_id, user_id, created_at) のテーブル | ◎ 推奨 |
| C: 既存 `likes` テーブルに polymorphic 追加 | likes に target_type を追加 | △ likes の意味が崩れる |

→ **案 B を採用。`response_count` は集計トリガーで同期するキャッシュ列とする。**

---
