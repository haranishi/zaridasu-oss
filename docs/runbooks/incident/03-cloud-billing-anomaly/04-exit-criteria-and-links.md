## 終了条件（「対応したつもり」で閉じない）

- [ ] 課金 / 利用量の急増が**止まった**（グラフが頭打ちになった）ことを確認した
- [ ] 原因を **不正 / バグ / 正当**のいずれかに切り分けた
- [ ] 不正アクセス起因なら [02](./02-account-takeover.md)、秘密漏洩起因なら [01](./01-secret-leak.md) の対応を実施した
- [ ] バグ起因ならリトライ / 冪等性の問題を特定し、再発しない設定にした（REQ-218）
- [ ] 停止した機能を安全に再開し、**クォータ / スペンドキャップ / キー制限を残した**
- [ ] 予算アラート（GCP 実績 / 予測）・Vercel Spend Management・Supabase 週次使用量確認が機能しているか点検した（REQ-218 AC-05）
- [ ] 想定外の課金額について、必要なら各社サポートに相談した（→ contacts.md）
- [ ] 証拠（請求明細・利用量・監査ログ・デプロイ履歴）を保全し、タイムラインを記録した

---

## 関連

- 索引・共通初動: [README.md](./README.md)
- 証拠保全: [evidence-preservation.md](./evidence-preservation.md)　|　連絡先: [contacts.md](./contacts.md)
- 課金ガードレール / kill switch: [REQ-218](../../requirements/REQ-218-cloud-cost-guardrails.md)
- 秘密漏洩: [01-secret-leak.md](./01-secret-leak.md)　|　乗っ取り: [02-account-takeover.md](./02-account-takeover.md)　|　Gemini キー: [`gemini-key-rotation.md`](../gemini-key-rotation.md)
