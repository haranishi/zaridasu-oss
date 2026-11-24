> ⚠️ **アーカイブ（2026-07-18 / REQ-282 FR-282-B4）**: 歴史的文書（当時のスナップショット）。以後更新しない。現況は `docs/requirements/` の REQ 文書とインデックスを参照。

# ザリダス Phase 2 改善要件定義書

> 作成日: 2026-03-28
> 対象: 秋田県外来生物情報マップ「ザリダス」
> ステータス: ドラフト

---

## これは何か

初期リリース後のザリダスについて、現状課題 C-01〜C-10 を洗い出し、
ユーザーストーリー US-01〜US-15 と非機能要件 NFR-01〜04 として Phase 2 の改善計画をまとめた要件定義書。
本文が長いため以下の部品ファイルへ逐語で分割し、このファイルは入口（索引）とした。

## 目的・背景の要約

初回訪問者→会員登録の導線が弱く（C-01）、Supabase Realtime 未活用で新規投稿に手動リロードが必要（C-02）、
通知はメールのみ（C-03）という「影響度：大」の課題に加え、フルテキスト検索なし（C-04）、
GeoJSON/公開 API なし（C-05）、Sentry 等の監視未導入（C-06）、E2E テストなし（C-07）、
データ品質検証の不足（C-08）、交流手段の不足（C-09）、WCAG 2.1 AA の部分準拠（C-10）が残っていた。

## 主要な決定事項の要点

- **3 フェーズで優先度付け**：
  - フェーズ 2A（即対応・1〜2 週間）＝ Sentry 導入、アクセシビリティ修正、コンバージョン強化、Realtime 投稿反映。
  - フェーズ 2B（計画対応・3〜6 週間）＝ 通知センター、Playwright E2E、フルテキスト検索、重複投稿検知、ウォークスルー。
  - フェーズ 2C（将来対応・2〜3 ヶ月）＝ プッシュ通知、GeoJSON/公開 API、地域別アラート、フォロー、月次レポート、境界ポリゴン精査。
- **技術選定**：@sentry/nextjs、Playwright、web-push + VAPID、pg_bigm、Haversine（DB 関数・PostGIS 不要）、
  react-joyride、axe-core + Playwright、Playwright screenshots。
- **DB マイグレーション**：Phase 2A は不要。2B で notifications／search_text + GIN／check_duplicate_post()、
  2C で push_subscriptions／user_alert_settings／user_follows／api_keys を追加。

## 目次（部品ファイル）

| ファイル | 内容 |
|---|---|
| [01-current-issues-and-ia.md](phase2-improvement/01-current-issues-and-ia.md) | 1. 現状の課題サマリー（C-01〜C-10）と 2. 情報アーキテクチャ（サイトマップ、主要ユーザーフロー） |
| [02-us-01-03-onboarding-conversion-realtime.md](phase2-improvement/02-us-01-03-onboarding-conversion-realtime.md) | 3 章冒頭と US-01 オンボーディング、US-02 会員登録コンバージョン強化、US-03 Supabase Realtime |
| [03-us-04-06-notifications.md](phase2-improvement/03-us-04-06-notifications.md) | US-04 アプリ内通知センター、US-05 PWA プッシュ通知、US-06 地域別アラート設定 |
| [04-us-07-08-search-and-open-api.md](phase2-improvement/04-us-07-08-search-and-open-api.md) | US-07 フルテキスト検索、US-08 GeoJSON エクスポート＆公開 API |
| [05-us-09-10-monitoring-and-e2e.md](phase2-improvement/05-us-09-10-monitoring-and-e2e.md) | US-09 Sentry エラー監視統合、US-10 Playwright E2E テスト導入 |
| [06-us-11-13-data-quality-and-community.md](phase2-improvement/06-us-11-13-data-quality-and-community.md) | US-11 重複投稿検知、US-12 秋田県境界ポリゴン精密チェック、US-13 コミュニティ・フォロー機能 |
| [07-us-14-15-and-non-functional.md](phase2-improvement/07-us-14-15-and-non-functional.md) | US-14 月次レポート自動生成、US-15 WCAG 2.1 AA 準拠、4. 非機能要件 NFR-01〜04 |
| [08-improvement-priority-and-ux-heuristics.md](phase2-improvement/08-improvement-priority-and-ux-heuristics.md) | 5. 改善提案一覧（フェーズ 2A/2B/2C）と 6. UX ヒューリスティック評価（ニールセンの 10 原則） |
| [09-db-migration-tech-and-appendix.md](phase2-improvement/09-db-migration-tech-and-appendix.md) | 7. DB マイグレーション計画、8. 技術選定、付録: コンテンツ優先度（P1〜P3） |
