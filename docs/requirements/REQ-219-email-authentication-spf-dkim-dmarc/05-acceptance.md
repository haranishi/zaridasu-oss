## 受入条件

- [ ] AC-01: `dig TXT zarigani-das.com` の出力に `v=spf1` レコードが**ちょうど 1 件**存在し、末尾が `~all` または `-all` で、`include:` 等を辿った DNS ルックアップが **10 回以内**である。
- [ ] AC-02: Resend ダッシュボードで `zarigani-das.com` が **Verified（DKIM/SPF 検証済み）** であり、`dig TXT|CNAME resend._domainkey.zarigani-das.com`（Resend 指定名）で DKIM レコードが返り、鍵長が 2048 ビットである。
- [ ] AC-03: `dig TXT _dmarc.zarigani-das.com` が `v=DMARC1; p=...; rua=mailto:...;` を返し、初期は `p=none` で **集約（rua）レポートが実際に受信できている**（少なくとも 1 回受領を確認）。
- [ ] AC-04: テスト送信したメール（通知 1 通＋ Auth 確認メール 1 通）のヘッダで、`Authentication-Results` が **SPF=pass / DKIM=pass / DMARC=pass（アライン）** を示す。Gmail の「メッセージのソースを表示」または mail-tester.com 等で **10 点満点中 10/10（または SPF/DKIM/DMARC 全項目グリーン）**であることを確認する。
- [ ] AC-05: 通知メール 4 関数の From が `NOTIFY_FROM_EMAIL`（既定 `ザリダス <noreply@zarigani-das.com>`）経由に統一され、4 関数すべてが同一の認証済みドメインから送信される（コード差分＋実送信ヘッダで確認）。`RESEND_API_KEY` 未設定時の fail-soft 挙動が維持されている。
- [ ] AC-06: 認証メール（確認/リセット/変更確認）について、選択した方式（FR-219-06 (a) or (b)）が `supabase/config.toml` と運用ドキュメントに反映され、(a) を選んだ場合は実送信メールのヘッダで `zarigani-das.com` からの SPF/DKIM/DMARC=pass が確認できる。
- [ ] AC-07: `zaridasu.com`（Web 専用ドメイン）について、メール送信に使わない方針なら `dig TXT zaridasu.com` が `v=spf1 -all` を、`dig TXT _dmarc.zaridasu.com` が `p=reject` を返す（または、使う方針ならそのドメインも SPF/DKIM/DMARC=pass）。送信に使う/使わないドメイン一覧が文書化されている。
- [ ] AC-08: DMARC レポートで一定期間（例 2〜4 週間）pass 率が高水準で安定したことを根拠に `p=quarantine` → `p=reject` へ引き上げた記録（判断基準と日付）が運用ドキュメントに残っている。
