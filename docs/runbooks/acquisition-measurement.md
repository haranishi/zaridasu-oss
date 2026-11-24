# 流入計測 runbook（REQ-289）

施策の流入元を分離して測るための手順と、**2026-08-02 ベースライン**の実測値。

> [!important] 計測は後付けができない
> 一度配った URL・QR コード・SNS 投稿に、後からパラメータを足すことはできない。
> 施策を開始したあとで「どれが効いたか分からない」と気づいても、その期間のデータは
> 復元できない。**施策の URL を作る前に、必ずこの runbook の手順を通すこと。**

---

## 主要な決定事項（要点）

- **URL を手で組まない。** `src/lib/shareUtm.ts` の `buildCampaignUrl()` を使う（表記ゆれとパラメータ漏れが必ず起きるため）。
- **`utm_*` と `from` は役割が違うので両方付ける。** `utm_*` は GA4 のセッション帰属、`from` はサインアップイベントへの帰属。
- **`from` の唯一の正は `src/lib/acquisition.ts` の `ACQUISITION_SOURCES`。** 台帳外の値は `other` に丸められ、元の値は `from_raw` として送られる（追加漏れの検知用）。新施策は URL を配る前に台帳へ追加する。
- **計測イベントは本番でしか飛ばない**（`src/lib/lpAnalytics.ts:36`）。綴り間違いは本番投入まで表面化しないので、配布前に検証手順を通す。
- **メール登録では `from` が失われやすく、Google OAuth だけが確実に帰属する。** この非対称性を知らずに集計すると OAuth 経路の施策が過大評価される。
- **`utm_content` を付け忘れた施策は、後からクリエイティブ単位で分離できない。** 外部施策では必ず指定する。

## 各部品

- [01-baseline.md](./acquisition-measurement/01-baseline.md) — 1. ベースライン（施策開始前のゼロ点）。`measured_on = 2026-07-29` の本番実測値の表、KGI と North Star、再取得用 SQL。
- [02-campaign-url.md](./acquisition-measurement/02-campaign-url.md) — 2. 施策 URL の作り方（`buildCampaignUrl()` の使用例、`utm_source`/`utm_medium`/`utm_campaign`/`utm_content`/`from` の役割表、`from` の台帳と丸めの挙動）。
- [03-verification.md](./acquisition-measurement/03-verification.md) — 3. 検証手順（本番でしか発火しないことの説明と、配布前に通す 4 ステップ：URL 目視 / DebugView / `from_raw` 確認 / 内部トラフィック除外）。
- [04-known-limitations-and-links.md](./acquisition-measurement/04-known-limitations-and-links.md) — 4. 既知の制約（メール登録での `from` 喪失と OAuth の非対称性、`utm_content` 付け忘れ）と 5. 関連（要件・実装・テスト・KPI ノート）。
