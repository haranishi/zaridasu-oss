## REQ-218（コストガード）との整合

- 本設定は REQ-218 の**入口側の上限**（egress・関数実行の暴発抑止）に対応する。`cloud-cost-guardrails.md`
  の監視（egress / 関数実行回数・時間のアラート）と合わせて運用する。
- しきい値超過が続く場合の段階的縮退（キャッシュ TTL 延長 → レート厳格化 → 一時的に配布停止）は
  `cloud-cost-guardrails.md` の段階表に準じる。
- AI コスト（Gemini）とは別系統だが、「入口で頻度・単価を抑える」という思想は共通。

---

## 検証

1. **正常系**: ブラウザ / `curl` で `/dataset/zaridasu.csv`・`/dataset/zaridasu.geojson`・`/api/og?...` が
   200 で返り、`Cache-Control`（`s-maxage=86400`）が付いていること。
2. **レート制限**: 短時間に上限を超える連続リクエストを送り、`429` + `Retry-After` が返ること
   （例: `for i in $(seq 1 80); do curl -s -o /dev/null -w "%{http_code}\n" "https://<host>/api/og?title=t"; done`）。
3. **キャッシュ**: 同一クエリの 2 回目以降が CDN キャッシュから返る（オリジン関数が呼ばれない）こと。
4. **行数上限**: 承認投稿が `DATASET_MAX_ROWS` に近づいた場合、CSV/GeoJSON が全件返り、上限到達時は
   Sentry / ログに `reached DATASET_MAX_ROWS cap` 警告が出ること（silent truncation でないこと）。

---

## 関連

- 要件定義: [REQ-245](../requirements/REQ-245-minor-hardening-bundle.md) / [REQ-218](../requirements/REQ-218-cloud-cost-guardrails.md) / [REQ-212](../requirements/REQ-212-public-endpoint-bot-rate-limit.md) / [REQ-230](../requirements/REQ-230-open-data-doi.md)
- 手順書: [`cloud-cost-guardrails.md`](./cloud-cost-guardrails.md)（コスト監視と段階的縮退） / [`supabase-hardening-checklist.md`](./supabase-hardening-checklist.md)
- 実装: `src/app/dataset/zaridasu.csv/route.ts`（`fetchPublicDataset` / `DATASET_MAX_ROWS`） / `src/app/api/og/route.tsx` / `src/middleware.ts`（matcher）
