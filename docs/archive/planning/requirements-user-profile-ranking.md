> ⚠️ **アーカイブ（2026-07-18 / REQ-282 FR-282-B4）**: 歴史的文書（当時のスナップショット）。以後更新しない。現況は `docs/requirements/` の REQ 文書とインデックスを参照。

# 要件定義: GAME-001 ユーザープロフィール・ランキング

- **ID**: GAME-001
- **優先度**: 🟠 中（投稿促進・リテンション向上）
- **対象ファイル**: 新規ページ + DB拡張
- **作成日**: 2026-03-20

---

## これは何か

投稿者向けのプロフィールページ・バッジ・ランキングを新設するための要件定義書。
機能要件 F1〜F7（DB テーブル、バッジ付与ロジック、ランキング RPC、各画面）と
RLS・非機能要件・実装フェーズ A〜F を定義している。
本文が長いため以下の部品ファイルへ逐語で分割し、このファイルは入口（索引）とした。

## 背景の要約

ログイン後も自分の投稿履歴・統計を見る画面がなく（Dashboard に myTotal のみ）、継続投稿のインセンティブもない。
他ユーザーの活動が見えず市民調査としての一体感が出にくい。既存の `get_user_activity()` RPC は管理者専用で、
一般ユーザーが自分のデータを活用できていない、という 4 点が出発点。

## 主要な決定事項の要点

- **`user_profiles` テーブルを新設**し `auth.users` と 1:1 で紐づける。既存ユーザーには
  `INSERT INTO user_profiles (id) SELECT id FROM auth.users ON CONFLICT DO NOTHING` で一括生成する。
- **匿名性の担保**：表示名（ニックネーム）を設定でき、メールアドレスは一切公開しない。
  プロフィール編集は本人のみ（RLS）、公開プロフィールは全員閲覧可、バッジ定義・付与は閲覧のみ。
- **バッジ付与トリガーは投稿の UPDATE（承認時）のみ発火**。過去分は初回マイグレーション時に一括付与スクリプトで対応。
- **ランキング RPC は 500ms 以内**（キャッシュ 5 分）。`get_user_ranking` は `STABLE` 指定でクエリキャッシュを活用。
- **実装フェーズ**：A（DB＋マイグレーション＋RLS・高）→ B（プロフィールページ＋編集モーダル・高）→
  C（バッジ・中）→ D（ランキングページ＋期間フィルタ・中）→ E（投稿者リンク・低）→ F（連続投稿バッジ・低）。
- **注意点**：`auth.users` へのトリガーは Supabase Dashboard の SQL Editor で実行が必要な場合がある。
  禁止ワードフィルタはフロントエンドと DB CHECK 制約の二重チェック。

## 目次（部品ファイル）

| ファイル | 内容 |
|---|---|
| [01-issues-and-user-stories.md](requirements-user-profile-ranking/01-issues-and-user-stories.md) | 現状の課題 4 点とユーザーストーリー US1〜US5（受け入れ条件付き） |
| [02-f1-f2-profile-and-badge-tables.md](requirements-user-profile-ranking/02-f1-f2-profile-and-badge-tables.md) | 機能要件の冒頭、F1 `user_profiles` テーブル、F2 バッジシステム（DB） |
| [03-f3-badge-award-logic.md](requirements-user-profile-ranking/03-f3-badge-award-logic.md) | F3 バッジ付与ロジック（DB 関数・トリガー） |
| [04-f4-ranking-rpc.md](requirements-user-profile-ranking/04-f4-ranking-rpc.md) | F4 ランキング RPC（`get_user_ranking` 等の DB 関数） |
| [05-f5-f7-frontend-pages.md](requirements-user-profile-ranking/05-f5-f7-frontend-pages.md) | F5 プロフィールページ、F6 ランキングページ、F7 プロフィール編集モーダル |
| [06-non-functional-rls-and-phases.md](requirements-user-profile-ranking/06-non-functional-rls-and-phases.md) | 非機能要件、RLS ポリシー、画面遷移、実装フェーズ A〜F、依存・注意事項 |
