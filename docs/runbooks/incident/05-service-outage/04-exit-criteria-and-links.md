## 終了条件（「対応したつもり」で閉じない）

- [ ] 落ちていた主要機能（投稿 / 地図 / AI 種判定 / 認証）が**復旧し、1 周通ることを確認**した
- [ ] 原因を特定した（直近デプロイ / 設定変更 / プロバイダ障害 / データ損失 / 攻撃）
- [ ] データ損失があった場合、`backup-restore.md` で復元し、**整合チェック（写真 / 音声 URL と実体の一致）**まで通した
- [ ] 攻撃 / 乗っ取り / 漏洩キー起因の疑いを検討し、該当すれば [01](./01-secret-leak.md) / [02](./02-account-takeover.md) の対応も完了した
- [ ] 利用者への一次連絡を出し、復旧後に続報（解消のお知らせ）を出した
- [ ] 暫定回避（ロールバック等）を恒久対策に置き換えた（暫定のまま放置しない）
- [ ] 証拠（エラー・Sentry・Status・デプロイ履歴・件数スナップショット）を保全し、タイムラインを記録した

---

## 関連

- 索引・共通初動: [README.md](./README.md)
- 証拠保全: [evidence-preservation.md](./evidence-preservation.md)　|　連絡先・一次連絡文面: [contacts.md](./contacts.md)
- データ復元: `docs/runbooks/backup-restore.md`（REQ-217 で整備予定） / [REQ-217](../../requirements/REQ-217-backup-bcp.md)
- AI 復旧: [`gemini-key-rotation.md`](../gemini-key-rotation.md) / [`ai-model-rollback.md`](../ai-model-rollback.md)　|　Edge Function: [`edge-function-deploy.md`](../edge-function-deploy.md)
- 攻撃 / 漏洩の疑い: [01-secret-leak.md](./01-secret-leak.md) / [02-account-takeover.md](./02-account-takeover.md)
