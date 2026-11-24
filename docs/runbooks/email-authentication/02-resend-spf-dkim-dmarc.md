## 2. 通知メール（Resend）の認証整備手順

### 2-1. Resend でドメインを検証する（DKIM / SPF）

1. Resend ダッシュボード → **Domains** → **Add Domain** で `zarigani-das.com` を追加する。
2. Resend が**払い出す DNS レコード**（DKIM の CNAME/TXT・SPF 用の TXT・送信用 MX 等）を控える。
   表示例（**実値はダッシュボードの表示に従う / 下記はプレースホルダ**）:

   | Type | Host（Name） | Value | 用途 |
   |---|---|---|---|
   | TXT | `send.zarigani-das.com` | `v=spf1 include:amazonses.com ~all` | SPF（Resend 送信元を許可） |
   | CNAME | `resend._domainkey.zarigani-das.com` | `resend._domainkey.xxxx.resend.com` | DKIM（**2048bit 推奨** / FR-219-02） |
   | MX | `send.zarigani-das.com` | `feedback-smtp.<region>.amazonses.com`（priority 10） | バウンス/苦情のフィードバック |

3. DNS レジストラの管理画面で上記を**そのまま**登録する。CNAME はフラット化（ALIAS 化）せずそのまま。
4. Resend ダッシュボードで **Verified** になるまで待つ（DNS 反映に数分〜数時間）。
   → これで **AC-02**（Resend Verified / DKIM 2048bit）を満たす。

### 2-2. SPF を 1 本に集約する（FR-219-01 / AC-01）

- **`zarigani-das.com` のルート TXT に `v=spf1 ...` を 1 レコードだけ置く。** SPF レコードが
  2 本以上あると **PermError で全 SPF が無効**になる（よくある事故）。
- Resend / Supabase SMTP（Resend）/ その他送信を使う場合は、**1 本の SPF にすべて `include:` でまとめる**。
  例（プレースホルダ。実際の include は各サービスの指定に従う）:
  ```dns
  zarigani-das.com.  TXT  "v=spf1 include:_spf.resend.com include:amazonses.com ~all"
  ```
- **DNS ルックアップ 10 回以内**に収める（`include:` を辿った合計。超えると PermError）。
  `include` を足しすぎないこと。確認は §4 の `dig` か checker。
- **末尾は導入初期 `~all`（softfail）で開始**し、運用が安定（DMARC で pass 率が高水準）したら
  **`-all`（hardfail）へ移行**する。

### 2-3. DMARC を `p=none` + `rua=` で開始する（FR-219-03 / AC-03）

- `_dmarc.zarigani-das.com` の TXT に最低限を設定する（**`rua` は実際に受信できるアドレスにする**）:
  ```dns
  _dmarc.zarigani-das.com.  TXT  "v=DMARC1; p=none; rua=mailto:dmarc-reports@zaridasu.com; fo=1; adkim=s; aspf=s"
  ```
  - `p=none`: まだ拒否しない（監視のみ）。
  - `rua=`: 集約レポートの受信先（運用者が受け取れる管理者メール等。プレースホルダ）。
  - `adkim=s` / `aspf=s`: アライメントを strict にしておくと、サブドメイン送信の取りこぼしに気づきやすい
    （初期はゆるめの `r` でも可。レポートを見て調整）。
- 集約レポートが**実際に届く**ことを確認する（少なくとも 1 回受領 / AC-03）。主要 ISP は日次で `rua` に送る。

---
