## 環境変数

| 変数名 | 置き場所 | 公開/秘匿 | 用途 |
|---|---|---|---|
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Vercel（Production / Preview / Development）＋ ローカル `.env.local` | **公開**（`NEXT_PUBLIC_` でクライアントに埋め込まれる） | Turnstile ウィジェットの site key。`AuthModal` がこの値の有無で CAPTCHA を出すか決める |
| Turnstile **Secret key** | **Supabase Dashboard** の Auth CAPTCHA 設定欄のみ | **秘匿**（クライアント・リポジトリに出さない） | Supabase が Turnstile の `siteverify` でトークン検証するための秘密鍵 |

- site key は `NEXT_PUBLIC_*` なので**公開前提**（漏れても site key 単体では悪用しにくい設計）。
- secret key は**コードにもクライアントにも置かない**。Supabase が自前で検証するため、アプリは secret を
  一切扱わない（`AuthModal` は token を送るだけ）。
- `.env.example` への追記は本ウェーブの別タスクが担当する。ここでは変数名のみ記載する。

---
