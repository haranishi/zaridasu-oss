# 研究 KPI 週次レビュー運用手順（REQ-233）

ザリダス（卒研 PF）の中心的主張 — **継続率・参加率・データ品質** — を、生存者バイアスと
Goodhart の法則を排した形で定量的に示すための KPI 体系・ダッシュボード・GA4 前提・週次レビューの運用書。

- ダッシュボード: 管理画面 `/admin/kpi`（`src/views/admin/AdminKpiPage.tsx`）
- 集計 RPC: `get_kpi_summary` / `get_kpi_quality_funnel` / `get_retention_cohorts`（すべて admin 限定・`SECURITY DEFINER SET search_path=public`・集計値のみ返却・PII 列非返却）
- 関連: REQ-175（実験 DID `/admin/experiments`）・REQ-232（GA4 行動イベント設計）・REQ-107（GA4 一本化）

> 設計の下敷き: Obsidian `02_notes/会社経営/実践・テンプレ/KPIダッシュボード設計.md` ほか。
> NSM は 1 つ・12ヶ月固定／NSM＋ガードレール＋KGI の 3 点セット／量×質を必ずペア／継続は獲得月コホートで／週次は WoW・3 行で残す。

---

## 主要な決定事項（要点）

- **NSM は「週次アクティブ投稿者数」1 つだけ。** 累計 DL・総 PV・総 MAU のような虚栄指標を NSM にしない。
- **数値目標は仮置き。** サンプルが貯まる 3ヶ月運用後に緑黄赤バンドを見直す。
- **GA4 と Supabase の役割を分ける。** 「閲覧 → 投稿開始 → 投稿完了」は GA4 の探索、「投稿完了 → 承認」は Supabase の RPC。承認は GA4 に入れない（二重計測回避・REQ-107）。
- **GA4 データ保持 14ヶ月化が最優先で非可逆。** 変更日より前に 2ヶ月で消えた個別データは復元できない。
- **PII は GA4 に送らない。** 検索語（`search_term`）は 2026-08-06 に廃止し、文字数のみ送る。
- **週次は cadence 固定・3 行で残し、打ち手は 1 つだけ。** 継続は必ず獲得月コホートで読む（生存者バイアス回避）。

## 各部品

- [01-kpi-register.md](./kpi-weekly-review/01-kpi-register.md) — 1. KPI Register（NSM の定義表、ガードレール指標、KGI、量×質ペア）。緑黄赤バンドはダッシュボードのカード色と一致。
- [02-participation-funnel.md](./kpi-weekly-review/02-participation-funnel.md) — 2. 参加ファネルの定義（GA4 と Supabase の役割分担表、GA4 ファネルデータ探索の作り方）。
- [03-ga4-data-retention.md](./kpi-weekly-review/03-ga4-data-retention.md) — 3. GA4 データ保持を 14ヶ月へ変更（手順・標準レポートへの影響なし・非可逆リスク・変更記録の表）。
- [04-pii-and-external-transmission.md](./kpi-weekly-review/04-pii-and-external-transmission.md) — 4. PII 非送出・外部送信規律の点検（GA4 への PII 混入点検、改正電気通信事業法の通知・公表対応）。
- [05-weekly-review-cadence.md](./kpi-weekly-review/05-weekly-review-cadence.md) — 5. 週次レビューの型（cadence・5 手順・3 行の記録テンプレ・Obsidian への保存先）。
- [06-monthly-and-links.md](./kpi-weekly-review/06-monthly-and-links.md) — 6. 月次（補助）の見方と関連要件・runbook リンク。
