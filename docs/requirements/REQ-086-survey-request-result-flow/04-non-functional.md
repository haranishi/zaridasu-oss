## 非機能要件

### パフォーマンス
- トリガーは 1 回の UPDATE のみで完了。posts INSERT への遅延 **5ms 以内**
- バックフィル SQL は対象が数十件想定なので高速完了

### セキュリティ
- トリガーは `SECURITY DEFINER` で実行。**RLS をバイパスするのは status 列のみ**で、他列は触らない
- `restrict_user_columns` トリガー（REQ-034）で `survey_request_id` の事後書き換えを禁止
- バナーから「依頼を見る」を新タブで開く際は `rel="noopener noreferrer"`

### UX
- バナーは目立ちすぎず、解除も 1 クリックで可能
- 紐付け中であることを送信ボタンの近くにも `aria-describedby` で再掲

---
