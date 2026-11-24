## 5. 検証（受入条件 AC-01〜04・06・07 の確認コマンド）

DNS 反映後、以下で確認する（`dig` が無ければ `nslookup` や https://mxtoolbox.com / https://dmarcian.com）。

```bash
# AC-01: SPF が「ちょうど 1 件」・末尾 ~all/-all・ルックアップ 10 回以内
dig +short TXT zarigani-das.com | grep spf1        # → v=spf1 ... ~all（or -all）が 1 行だけ

# AC-02: DKIM（Resend 指定ホスト名。CNAME か TXT。実名はダッシュボード表示）
dig +short CNAME resend._domainkey.zarigani-das.com

# AC-03: DMARC（初期 p=none + rua）
dig +short TXT _dmarc.zarigani-das.com             # → v=DMARC1; p=none; rua=mailto:...

# AC-07: Web 専用ドメインのなりすまし対策
dig +short TXT zaridasu.com                        # → v=spf1 -all
dig +short TXT _dmarc.zaridasu.com                 # → v=DMARC1; p=reject; ...
```

- **AC-04（実送信ヘッダ）**: 通知メール 1 通＋ Auth 確認メール 1 通を自分宛に送り、Gmail の
  「メッセージのソースを表示」で `Authentication-Results` が **SPF=pass / DKIM=pass / DMARC=pass（アライン）**
  になっていることを確認する。または https://www.mail-tester.com に送って **10/10**（SPF/DKIM/DMARC 全緑）を確認。
- **AC-05（From 統一）**: コード上 4 通知関数 + 3 ライフサイクル関数が `NOTIFY_FROM_EMAIL` 経由で
  同一ドメインから送ることを確認（本書 §1 の表）。`RESEND_API_KEY` 未設定時の fail-soft も維持。

---

## 6. DMARC 段階移行の判断基準と記録（FR-219-04 / NFR-219-03 / AC-08）

`p=none` のレポートで「正規送信なのに SPF/DKIM が fail / 未アライン」を洗い出し、修正してから引き上げる。

### 段階と判断基準（目安）

| 段階 | ポリシー | 引き上げ条件（目安） |
|---|---|---|
| 1. 監視 | `p=none` | `rua` レポートが届き、正規送信（Resend / Supabase SMTP）の **DMARC pass 率が 99% 以上**で **2〜4 週間**安定。認証漏れ（自分のサービスからなのに fail）が解消済み。 |
| 2. 隔離 | `p=quarantine; pct=25`→`50`→`100` | 隔離開始後も pass 率が高水準を維持。正規メールが迷惑判定されていない（テスト送信で確認）。`pct` を段階的に上げる。 |
| 3. 拒否 | `p=reject` | `quarantine; pct=100` で一定期間（例 1〜2 週間）問題なし。**この時点で SPF 末尾を `~all`→`-all` に上げる**（FR-219-01）。 |

- 例（隔離段階）:
  ```dns
  _dmarc.zarigani-das.com.  TXT  "v=DMARC1; p=quarantine; pct=50; rua=mailto:dmarc-reports@zaridasu.com; fo=1;"
  ```
- **記録（AC-08）**: 各段階へ引き上げた**日付と根拠（pass 率・観測期間）**を下表に追記する。

### 移行ログ（運用者が随時追記）

| 日付 | 変更 | 根拠（pass 率 / 観測期間 / 備考） | 実施者 |
|---|---|---|---|
| YYYY-MM-DD | `zarigani-das.com` DMARC `p=none` 設定・`rua` 受信開始 | 初期導入 |  |
| YYYY-MM-DD | `p=quarantine; pct=25` へ | pass 率 ◯◯% / ◯週間安定 |  |
| YYYY-MM-DD | `pct=100` へ |  |  |
| YYYY-MM-DD | `p=reject` へ＋ SPF を `-all` に |  |  |

---
