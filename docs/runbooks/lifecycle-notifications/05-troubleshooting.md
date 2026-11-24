## 6. トラブルシュート

- **メールが届かない / cron が動かない**: §2-3 の `cron.job` 確認 → Vault キー → pg_net 拡張の順で確認。
  Vault 未設定だとラッパ関数は no-op（fail-soft）で黙って終わる。
- **研究採用通知が二重に届く**: `posts.research_adopted_notified_at` が立っているか確認。
  立っていれば `notify-research-adopted` は `already_notified` でスキップするはず（多重送信防止）。
- **opt-out したのに届く**: `user_profiles` の該当フラグが false か確認。`mailer.ts` は送信前に必ずゲートする。
- **`/u/unsubscribe` が「無効なリンク」**: トークンが URL から欠落（`t=` 無し）か、トークンが
  ローテーション済み。`resolve_unsubscribe_token` が 0 行を返すと invalid 表示になる。
- **PII 混入の疑い**: メール本文・`lifecycle_email_log` に座標・reporter_ip・他人情報が無いことを確認
  （NFR-234-03 / REQ-211 / REQ-179）。集計は市区町村粒度まで。
