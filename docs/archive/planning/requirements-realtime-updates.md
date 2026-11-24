> ⚠️ **アーカイブ（2026-07-18 / REQ-282 FR-282-B4）**: 歴史的文書（当時のスナップショット）。以後更新しない。現況は `docs/requirements/` の REQ 文書とインデックスを参照。

# 要件定義: FEAT-001 リアルタイム更新（Supabase Realtime）

- **ID**: FEAT-001
- **優先度**: 🔴 高（ユーザー体験に直結）
- **使用API**: Supabase Realtime（Postgres Changes）
- **作成日**: 2026-03-20

---

## これは何か

投稿・コメント・いいね・承認待ち件数を Supabase Realtime（Postgres Changes）でリアルタイム反映させるための要件定義書（FEAT-001）。長いため機能要件 F1〜F5 の境界で分割し、本文は `requirements-realtime-updates/` 配下へ逐語で移した。

## 目的・背景の要約

投稿一覧は初回ロードとフィルタ変更時にしか取得しておらず（`usePostList`）、新規投稿や他ユーザーの承認が地図に反映されるにはリロードが必要だった。詳細ページのコメント・いいね、管理画面の承認待ち件数も同様で、ページを開いたまま待っても更新されない。これを解消し、リロードなしで最新状態が見える体験にするのが目的。

## 主要な決定事項（要点）

- 対象は `posts`（INSERT/UPDATE/DELETE）、`comments`（INSERT/DELETE）、`likes`（INSERT/DELETE）の 3 テーブル。Supabase ダッシュボードの Database → Replication で Realtime を有効化する準備作業が前提。
- **チャネルは必要なテーブル・フィルタのみ subscribe** し全テーブル監視はしない。ページ離脱時は `removeChannel()` で確実にクリーンアップする。
- **バックグラウンドタブでは `visibilitychange` を使って unsubscribe**、復帰時に再 subscribe と差分取得を行う。
- 新着投稿は即時挿入ではなく「新しい投稿があります」バナー方式にし、閉じた場合は次のイベントでカウントを累積する。
- コスト・性能面の前提は Supabase Free プランの Realtime 200 同時接続まで無料、配信レイテンシ 100〜500ms。RLS が Realtime にも適用され、承認済み投稿のみ配信されることを確認する。

## 分割ファイル

- [01-issues-and-user-stories.md](requirements-realtime-updates/01-issues-and-user-stories.md) — 現状の課題とユーザーストーリー（住民・閲覧者・管理者・投稿者）
- [02-f1-f2-posts-and-comments.md](requirements-realtime-updates/02-f1-f2-posts-and-comments.md) — F1 投稿リストのリアルタイム更新（HomePage）／F2 コメントのリアルタイム更新（DetailPage）
- [03-f3-f5-likes-badge-connection-and-nonfunctional.md](requirements-realtime-updates/03-f3-f5-likes-badge-connection-and-nonfunctional.md) — F3 いいね／F4 承認待ち件数バッジ／F5 接続状態の表示と非機能要件
- [04-implementation-design-and-tests.md](requirements-realtime-updates/04-implementation-design-and-tests.md) — 実装設計（新規・変更ファイル）、実装前の準備作業、テスト観点
- [05-user-flows.md](requirements-realtime-updates/05-user-flows.md) — 画面遷移・ユーザーフロー（トップページ／詳細ページ／管理画面バッジ）
