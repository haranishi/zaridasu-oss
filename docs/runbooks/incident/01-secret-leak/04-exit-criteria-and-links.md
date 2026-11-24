## 終了条件（「対応したつもり」で閉じない）

- [ ] 漏れた秘密を**発行元で失効 / ローテーション済み**で、旧値が無効になっていることを確認した
- [ ] 新しい秘密で本番の主要フロー（投稿・AI 種判定・通知・管理）が正常動作する
- [ ] 漏れた秘密による**悪用の痕跡を確認**し、無し（または範囲を特定して対処済み）と結論づけた
- [ ] 課金 / 個人データへの波及があれば [03](./03-cloud-billing-anomaly.md) / [04](./04-personal-data-breach.md) の終了条件も満たした
- [ ] 漏洩元（コミット / チャット / ログ）の秘密値を可能な範囲で除去 / 隠蔽した
- [ ] 証拠（Secret scanning アラート・痕跡ログ・スクショ）を保全した（→ evidence-preservation.md）
- [ ] 再発防止: なぜ漏れたか（手元 `.env` の取り違え・`NEXT_PUBLIC_` 誤用・ログ出力・CI 設定）を特定し、対策（secret scanning の有効化＝REQ-210・キーの権限最小化・出力からの除外）を実施した
- [ ] タイムライン（発見〜失効〜復旧）を記録した

---

## 関連

- 索引・共通初動: [README.md](./README.md)
- 証拠保全: [evidence-preservation.md](./evidence-preservation.md)　|　連絡先: [contacts.md](./contacts.md)
- Gemini キー復旧: [`gemini-key-rotation.md`](../gemini-key-rotation.md)
- 課金波及: [03-cloud-billing-anomaly.md](./03-cloud-billing-anomaly.md)　|　個人データ波及: [04-personal-data-breach.md](./04-personal-data-breach.md)
- 予防（CI secret scanning）: [REQ-210](../../requirements/REQ-210-ci-supply-chain-sast-secret-scanning.md)
