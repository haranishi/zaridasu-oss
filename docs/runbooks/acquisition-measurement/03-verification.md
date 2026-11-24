## 3. 検証手順（本番でしか発火しない）

`src/lib/lpAnalytics.ts:36` の `if (process.env.NODE_ENV !== 'production') return` により、
**開発環境と Vercel プレビューでは計測イベントが飛ばない**。したがって綴り間違いは
本番投入まで表面化しない。配布前に必ず次を通すこと。

1. **URL の目視確認** — `buildCampaignUrl()` の戻り値をそのまま貼り、`from` と `utm_content` が
   入っていることを確認する。手打ちしない。
2. **GA4 DebugView で 1 件流す** — 本番 URL を自分で踏み、`sign_up_initiated` /
   `sign_up` に `from` が乗ることを確認する。
3. **`from_raw` が出ていないか確認** — 出ていたら台帳への追加漏れ。URL を配る前に直す。
4. **自分のセッションを集計から除外** — GA4 の内部トラフィック除外を設定しておく。
   母数が 2 桁の段階では、自分の 1 セッションが比率を大きく歪める。

---
