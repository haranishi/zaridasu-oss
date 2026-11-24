## 0. 重要な前提（読み飛ばし厳禁）

- **本件の中心は DNS / 外部サービス設定であり、コード変更は最小。** アプリ側で行ったのは
  「通知メールの送信元 From を環境変数 `NOTIFY_FROM_EMAIL` に一元化」しただけ（FR-219-05）。
  SPF / DKIM / DMARC レコードの追加、Resend のドメイン検証、Supabase の SMTP 設定は
  **すべて人手の運用作業**で、本書に手順化する。
- **秘密値は DNS にもコミットにも置かない（NFR-219-01）。** DNS に置くのは公開前提の
  SPF / DKIM / DMARC レコードだけ。`RESEND_API_KEY` / `RESEND_SMTP_KEY` の実値は
  Supabase Dashboard → Edge Functions → Secrets（通知メール）/ Authentication → SMTP（認証メール）
  にのみ置く。`NEXT_PUBLIC_` は厳禁。
- **DMARC を `reject` へ一気に上げない（NFR-219-03）。** 必ず `p=none`（監視）→ `quarantine`
  → `reject` の順で、レポートで pass 率を確認しながら段階移行する。飛ばすと**正規メールが誤拒否**され、
  新規登録の確認メールやパスワードリセットが届かず、参加者獲得（市民科学エンゲージ）に直結で損失が出る。
- **本書の DNS レコード値はすべて「例示プレースホルダ」。** 実値（Resend が払い出す DKIM の
  ホスト名・値、`rua` の受信先アドレス等）は各ダッシュボードの表示と DNS レジストラの管理画面に従う。

---

## 1. 送信ドメイン一覧（どのドメインから何を送るか / 使う・使わない）

| ドメイン | 用途 | メール送信 | 認証で整えるもの |
|---|---|---|---|
| `zarigani-das.com` | **メール送信元**（`noreply@zarigani-das.com`）。通知メール（Resend）＋（方針 (a) なら）認証メール | **使う** | SPF（1 本・`include` Resend）/ DKIM（Resend 払い出し）/ DMARC（`p=none`→`quarantine`→`reject`） |
| `zaridasu.com` | **Web 専用**（`site_url` / アプリ URL）。メールは送らない方針 | **使わない** | なりすまし対策の厳格 SPF（`-all`）/ DMARC（`p=reject`）/ 可能なら null-MX |

- **Web ドメインとメールドメインが異なる**（`zaridasu.com` vs `zarigani-das.com`）が、DMARC は
  送信ドメイン側（`zarigani-das.com`）の `_dmarc` を評価するため、この不一致自体は技術的問題ではない。
  ただし運用上「送る/送らない」を明確にし、送るドメインで DMARC を、送らないドメインでなりすまし拒否を整える。
- **ドメイン統一方針（FR-219-05 / NFR-219-02）**: コードの既定 From は **`zarigani-das.com` に統一済み**。
  将来 Web と完全に揃えて `zaridasu.com` から送る形に寄せる場合は、(1) `NOTIFY_FROM_EMAIL` を
  `ザリダス <noreply@zaridasu.com>` に変更、(2) `zaridasu.com` 側に Resend の DKIM/SPF と DMARC を整備、
  (3) 本書の表の「使う/使わない」を入れ替える、の 3 点を**必ず一括で**行う（片方だけ変えるとドリフトで全断）。

### 送信元 From の一元化（実装済み・コード側）

`NOTIFY_FROM_EMAIL`（既定 `ザリダス <noreply@zarigani-das.com>`）を全通知関数が参照する。

| ファイル | 参照経路 |
|---|---|
| `supabase/functions/notify-post-status/index.ts` | 直接 `Deno.env.get('NOTIFY_FROM_EMAIL')` |
| `supabase/functions/notify-comment/index.ts` | 同上 |
| `supabase/functions/notify-survey-request/index.ts` | 同上 |
| `supabase/functions/notify-gemini-key-failure/index.ts` | 同上 |
| `supabase/functions/notify-research-adopted/index.ts` | `_shared/mailer.ts` 経由 |
| `supabase/functions/notify-dormant-reengage/index.ts` | `_shared/mailer.ts` 経由 |
| `supabase/functions/notify-weekly-digest/index.ts` | `_shared/mailer.ts` 経由 |

- 未設定時は既定値にフォールバックするため、Secrets 未設定でも**既存挙動は壊れない**。
- `RESEND_API_KEY` 未設定時は送信をスキップして 200 を返す fail-soft も維持（NFR-219-04）。
- From のドメインは **DNS で認証済みのものに限る**。`NOTIFY_FROM_EMAIL` を未認証ドメインに変えると
  DMARC fail で到達性が落ちるため、必ず本書 §2〜3 の認証を済ませてから変更する。

---
