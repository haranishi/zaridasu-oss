## 推奨設定：プラットフォーム側レート制限

いずれか一方（本番のホスティング / CDN 構成に合わせて）を設定する。**保存系ではなく閲覧系**なので、
正規利用を十分上回る緩めのしきい値にし、超過時は `429`（`Retry-After` 付き）を返す。

### A. Vercel（Firewall / WAF ルール）

Vercel Dashboard > プロジェクト > **Firewall** で、パス条件付きのレート制限ルールを追加する。

- 条件: `Path` が `/dataset/` で始まる **または** `Path` が `/api/og` に一致
- アクション: **Rate Limit**（例: **60 requests / 60s / IP**。研究者の一括 DL や SNS プレビューを妨げない緩め）
- 超過時: `429 Too Many Requests`
- 追加で **Bot 対策**（`Challenge`）を明らかな bot UA に適用してもよい（正規のクローラ＝OGP 取得は許可）。

> 恒久上限として、`/api/og` は生成コストが高いので `/dataset/*` より厳しめ（例: 30 req/60s/IP）にしてもよい。

### B. Cloudflare（前段に置く場合：Rate Limiting Rules）

Cloudflare Dashboard > **Security > WAF > Rate limiting rules**。

- 式: `(starts_with(http.request.uri.path, "/dataset/")) or (http.request.uri.path eq "/api/og")`
- Rate: 例 **60 / 1 min / by IP**（`/api/og` は別ルールで 30 / 1 min など）
- Action: **Block**（`429`）、期間はスライディングウィンドウ
- キャッシュ: CDN の TTL（`s-maxage=86400`）を尊重し、キャッシュヒットはオリジン（Vercel 関数 / DB）に
  到達させない。Cache Rules で `/dataset/*` を確実にキャッシュ対象にする。

> どちらの経路でも **`Retry-After` を返す**設定にし、クライアントが後退できるようにする。

---
