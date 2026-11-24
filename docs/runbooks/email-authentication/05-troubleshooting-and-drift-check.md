## 7. トラブルシュート

| 症状 | 原因の典型 | 対処 |
|---|---|---|
| SPF が効かない / PermError | SPF TXT が 2 本以上ある / ルックアップ 10 回超過 | TXT を 1 本に統合し `include` を削減（§2-2） |
| DKIM=fail | Resend 払い出しの CNAME/TXT が未登録 or 値が違う | Resend ダッシュボードの表示と DNS を突き合わせ再登録（§2-1） |
| DMARC=fail（アライン不一致） | From ドメインと DKIM/SPF ドメインが揃っていない | From を `NOTIFY_FROM_EMAIL` で送信ドメインに統一（実装済）。`adkim/aspf` を一旦 `r` に緩めて切り分け |
| 認証メールだけ迷惑メール | 方針 (b)（Supabase 既定送信）のまま | 方針 (a)（Resend SMTP）へ切替・Dashboard で SMTP 設定（§3） |
| From を変えたら全部届かない | 未認証ドメインに `NOTIFY_FROM_EMAIL` を変更した | 認証済みドメインに戻す。新ドメインは §2 の認証を先に済ませる（NFR-219-02） |

---

## 8. 変更時のドリフト防止チェックリスト（NFR-219-02）

送信ドメイン（または From 既定値）を変えるときは、**以下 3 者を必ず同時に揃える**:

- [ ] コード/env: `NOTIFY_FROM_EMAIL`（Secrets）と `config.toml` の SMTP `admin_email`
- [ ] DNS: 新ドメインの SPF（1 本）/ DKIM（Resend 払い出し）/ DMARC（段階移行は再度 `p=none` から）
- [ ] 外部サービス: Resend の Domain 検証（新ドメインで Verified）/ Supabase SMTP 設定
- [ ] 本書 §1 の「送信ドメイン一覧（使う/使わない）」と §6 の移行ログを更新
