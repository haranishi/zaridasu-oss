> ⚠️ **アーカイブ（2026-07-18 / REQ-282 FR-282-B4）**: 歴史的文書（当時のスナップショット）。以後更新しない。現況は `docs/requirements/` の REQ 文書とインデックスを参照。

# REQ-017〜032 実装後 確認チェックリスト

実施日: 2026-04-08
対象: REQ-017〜REQ-032（16件）の一括実装

---

## これは何か

REQ-017〜032 の16件を一括実装した直後（2026-04-08）に、リリース前の手動確認手順をまとめたチェックリスト。項目数が多いため本ファイルを入口とし、チェック項目は同名ディレクトリ配下の部品に逐語で分割している。

## 目的・背景

16件を一度にまとめて実装したため、コードのマージだけでは完了しない作業（シークレットの再生成、SQLマイグレーションの手動実行、Supabase 側の MFA 有効化）と、退行がないかを人が目で見る必要がある確認項目が大量に発生した。それを漏れなく順番に消化するための当時の作業票がこの文書。

## 主要な決定事項（要点）

- **コードだけでは終わらない作業を先頭に置く**：シークレットローテーション（REQ-017・Critical）→ SQLマイグレーション2本を**順番に**実行（REQ-020/025/032・Critical）→ MFA有効化（REQ-018・High）。
- マイグレーション後は `pg_policies` に `public_read`/`public_insert` が残っていないこと、`audit_logs` にトリガーログが入ること、`get_dashboard_stats()` が JSON を返すことを SQL で直接確認する。
- 機能確認は REQ 単位ではなく画面・機能単位（認証／投稿フォーム／地図／画像／SEO／i18n／UI／A11y／統計／監査ログ）で10ブロックに整理する。
- パフォーマンスは Lighthouse でモバイル 70+・LCP 2.5秒以下・CLS 0.1以下を目標値とする。
- 監査ログは UPDATE/DELETE 不可（改ざん防止）であることまで確認対象に含める。

## 部品

- [01-manual-tasks.md](verification-checklist/01-manual-tasks.md) — 1. 手動対応が必要な項目（シークレットローテーション／SQLマイグレーション／MFA有効化）。
- [02-check-auth-and-post-form.md](verification-checklist/02-check-auth-and-post-form.md) — 2-1 認証・セキュリティ（REQ-018/019）、2-2 投稿フォーム（REQ-021/029）。
- [03-check-map-image-seo-i18n.md](verification-checklist/03-check-map-image-seo-i18n.md) — 2-3 地図表示、2-4 画像最適化、2-5 SEO・メタデータ、2-6 i18n。
- [04-check-ui-a11y-stats-auditlog.md](verification-checklist/04-check-ui-a11y-stats-auditlog.md) — 2-7 UI一貫性、2-8 アクセシビリティ、2-9 ダッシュボード統計、2-10 監査ログ。
- [05-performance-and-changed-files.md](verification-checklist/05-performance-and-changed-files.md) — 3. パフォーマンス確認の目標値と、4. 変更ファイル一覧（新規/削除/主な変更）。
