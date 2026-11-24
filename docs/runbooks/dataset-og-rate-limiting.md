# データセット / OG エンドポイントのレート制限（プラットフォーム側）手順書

> 参照要件: REQ-245 (FR-245-03)
> 連携要件: REQ-218（コストガード）, REQ-212（公開エンドポイントの bot / レート制限）, REQ-230（オープンデータ配布）
> 対象: `/dataset/zaridasu.csv`・`/dataset/zaridasu.geojson`・`/api/og`
> 所要時間: **15〜30 分**（Vercel or Cloudflare のルール 1〜2 本追加 + 動作確認）

---

## いつ使うか

- `/dataset/*`（CSV / GeoJSON）や `/api/og`（OG 画像生成）に対する**過剰アクセス／スクレイピング／DoS 相当**の兆候があるとき
- コスト監視（REQ-218 / `cloud-cost-guardrails.md`）で **egress・関数実行回数・実行時間**の異常増を検知したとき
- 公開前の恒久設定として、キャッシュミス経路の DB 到達・画像生成コストに上限を敷いておきたいとき

---

## 主要な決定事項（要点）

- **`/dataset/*` と `/api/og` は意図的に `src/middleware.ts` の matcher 外**（REQ-212）。公開 GET・閲覧系なので可用性を優先し、誤検知で研究者のデータ DL や SNS の OGP プレビューを巻き込まない。
- **頻度の上限はプラットフォーム側（Vercel Firewall / Cloudflare Rate limiting rules）で敷く。** インメモリのトークンバケットはインスタンスごとに揮発する粗いふるいで、分散アクセスには無力。重いアプリ内レートリミッタや新規依存は入れない（REQ-245）。
- **アプリ内の既存緩和はコスト上限であって頻度上限ではない。** CDN キャッシュ・入力の許可リスト化・`DATASET_MAX_ROWS = 100_000` は 1 リクエストのコストを抑えるが、リクエスト頻度は抑えない。
- **上限到達は silent truncation にせず `logError` で警告**する（Sentry / console）。
- **しきい値は正規利用を十分上回る緩めに設定し、超過時は `429` + `Retry-After`。** 生成コストの高い `/api/og` は `/dataset/*` より厳しめでよい。

## 各部品

- [01-why-out-of-app-scope.md](./dataset-og-rate-limiting/01-why-out-of-app-scope.md) — 背景: なぜこれらがアプリ内レート制限の対象外なのか（middleware matcher の設計、公開書き込みが Next.js を経由しない構成、インメモリ制限の限界）。
- [02-current-in-app-mitigations.md](./dataset-og-rate-limiting/02-current-in-app-mitigations.md) — 現状のアプリ内緩和策の一覧表（CDN キャッシュ・入力許可リスト・座標粗化・`DATASET_MAX_ROWS`・OG 入力サイズ上限）とキャッシュミス経路の注意。
- [03-platform-rate-limit-settings.md](./dataset-og-rate-limiting/03-platform-rate-limit-settings.md) — 推奨設定（A: Vercel Firewall のルール条件・アクション・しきい値例、B: Cloudflare Rate limiting rules の式・Rate・Cache Rules）。
- [04-cost-guard-alignment-and-verification.md](./dataset-og-rate-limiting/04-cost-guard-alignment-and-verification.md) — REQ-218 コストガードとの整合（段階的縮退の順序）、検証手順 4 項目（正常系 / レート制限 / キャッシュ / 行数上限）、関連リンク。
