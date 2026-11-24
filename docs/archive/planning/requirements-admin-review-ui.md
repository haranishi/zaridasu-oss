> ⚠️ **アーカイブ（2026-07-18 / REQ-282 FR-282-B4）**: 歴史的文書（当時のスナップショット）。以後更新しない。現況は `docs/requirements/` の REQ 文書とインデックスを参照。

# 要件定義: UI-001 管理者投稿審査画面のUI改善

- **ID**: UI-001
- **優先度**: 🔴 高（管理者の日常業務に直結）
- **対象ファイル**: `src/pages/admin/AdminPostsPage.jsx`
- **作成日**: 2026-03-20

---

## これは何か

管理者の投稿審査画面（AdminPostsPage）を、横長テーブルからカード型レイアウトへ作り替えるための要件定義書。
ユーザーストーリー US1〜US6、機能要件 F1〜F8、実装設計、テスト観点までを定義している。
本文が長いため以下の部品ファイルへ逐語で分割し、このファイルは入口（索引）とした。

## 背景の要約

審査画面は `text-xs`/`text-sm` で文字が小さく、1 行に日付・市区町村・種類・種別・コメント・写真・AI 判定・
操作ボタンを詰め込んでいて一覧性が悪い。写真は 8x8px で種別判定の参考にならず、AI 判定はクリックしないと
詳細が見えず、コメントは `truncate` で切れ、位置情報は地図で確認できない。さらに `min-w-[800px]` のため
モバイルでは横スクロールが必須で、現場からの緊急審査に耐えない。

## 主要な決定事項の要点

- **審査待ちタブだけをカード型に変更**し、公開中・却下済み・全件タブはテーブル形式のまま維持する（F5）。
- **即対応（高）**：カード型レイアウト（F1）、写真プレビュー拡大（F2、160px 以上）、
  AI 判定結果の常時表示（F3、信頼度・検出種・画質）、フォントサイズ拡大（全タブ共通）。
- **計画対応（中）**：ミニマップ追加（F4、画面外カードでは描画しない遅延読み込み）、
  レスポンシブカード対応（F6）、一括承認ボタン（F7）。
- **将来対応（低）**：キーボードショートカット（F8）。
- **カード内のコンテンツ優先度**：P1 = 写真プレビュー／AI 判定結果／承認・却下ボタン、
  P2 = 種類・種別・市区町村／コメント全文／ミニマップ、P3 = 個体数・観察日・天気／投稿日時。

## 目次（部品ファイル）

| ファイル | 内容 |
|---|---|
| [01-issues-and-user-stories.md](requirements-admin-review-ui/01-issues-and-user-stories.md) | 現状の課題 7 点とユーザーストーリー US1〜US6（受け入れ条件付き） |
| [02-f1-f4-card-layout-photo-ai-minimap.md](requirements-admin-review-ui/02-f1-f4-card-layout-photo-ai-minimap.md) | 機能要件の冒頭、F1 カード型レイアウト、F2 写真プレビュー拡大、F3 AI 判定の常時表示、F4 ミニマップ |
| [03-f5-f8-tabs-responsive-bulk-shortcuts.md](requirements-admin-review-ui/03-f5-f8-tabs-responsive-bulk-shortcuts.md) | F5 公開中・却下済みタブはテーブル維持、F6 レスポンシブ対応、F7 一括操作の改善、F8 キーボードショートカット |
| [04-non-functional-and-implementation-design.md](requirements-admin-review-ui/04-non-functional-and-implementation-design.md) | 非機能要件と実装設計（新規ファイル・変更ファイルの一覧） |
| [05-user-flow-content-priority-and-tests.md](requirements-admin-review-ui/05-user-flow-content-priority-and-tests.md) | 画面遷移・ユーザーフロー（改善後の審査フロー）、カード内コンテンツ優先度、改善提案一覧、テスト観点 10 項目 |
