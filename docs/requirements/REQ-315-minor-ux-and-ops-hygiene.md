# REQ-315: 小規模UX・運用衛生の一括対応（二重送信ガード・ロケール・サインアウト・タイマー・実行リージョン）

作成日: 2026-07-30
優先度: **P2** ／ 深刻度: **Low** ／ 種別: UX・運用衛生
状態: **提案 / 未実装**
関連: REQ-223（フォームUXとマイクロコピー。FR-223-08 の二重送信ガード方針が本REQの正本）, REQ-277（i18n 残ハードコード。Phase1/2 の対象表から漏れた箇所を扱う）, REQ-282（プロジェクト整理。運用衛生の続き）, REQ-281（CI・運用強化。未実装）, REQ-193（操作失敗のフィードバック）, REQ-209（タイマー・購読の解放）, REQ-275（h1 の網羅。noindex ページが対象外だった）

## これは何か

単独では起票する価値が薄い Low 項目 7 件（問題A〜G）を、性質ごとにまとめて一度で片付けるための要件。
本文は全文を下の部品ファイルへ逐語で移動してある（この入口の要約部分のみ新規記述）。

## 目的・背景の要約

7 項目すべてに共通するのは「**同じリポジトリ内に正しい実装が既にあり、そこだけ揃っていない**」という形をしている点。したがって修正方針を新たに設計する必要はなく、既存の前例に合わせるだけで済む（唯一の例外が問題G の実行リージョンで、これは前例なし）。

## 主要な決定事項の要点

- 7 つの問題は **A: 二重送信ガードの適用漏れ／B: 日時のロケール固定＋blob URL リーク／C: サインアウトの fire-and-forget／D: 処理中の背景タップでモーダルが閉じる／E: 未クリアの `setTimeout`／F: `/dashboard` に h1 が無い／G: Vercel 実行リージョンが未固定**。
- **修正は既存の前例に合わせる**。二重送信ガードは `PostForm.tsx:175`、ロケールは `DATE_LOCALE_TAG` マップ、blob URL は `usePostForm.ts:56-64`、サインアウトは `AdminLayout.tsx:144-147`、タイマーは `FilterBar.tsx:58-59`、h1 は `(home)/page.tsx:17` の sr-only 方式。
- **重複回避の相互参照** — 問題A のうち `AdminPostsPage`（一括操作）は REQ-295、`EditProfileModal` は REQ-301／REQ-313 が同じハンドラに触れる。**それらが先に着手された場合はその中でガードを入れて本REQの該当分を消化してよい**（同じ行を二度書き換えない）。
- 実害の大きさは一様ではない。`ReportModal` の重複送信は DB の重複通報制約で最終的に安全側だが汎用エラーが出る（判別可能化は REQ-299 の対象）。**`AdminPostsPage` の一括操作はサーバー側の冪等性が無く**、監査ログの二重記録やストレージ削除の二重呼び出しにつながる。`AuthCallbackPage` のタイマーは意図しない `/dashboard` 遷移を起こす実害あり。
- **既存の見た目・書式は変えない**方針を各 FR に明記（表示オプション、写真プレビュー、成功時の挙動、レイアウト、h2 以下の階層）。
- **問題G の本質は遅延ではなく、設定が Vercel ダッシュボードにしか存在しない状態そのもの**。`vercel.json` に `"regions": ["hnd1"]` を書いてレビュー可能・再現可能にする。効果は実測を記録するだけで断定しない。

## 部品ファイル

| ファイル | 内容 |
|---|---|
| [01-background.md](REQ-315-minor-ux-and-ops-hygiene/01-background.md) | 背景 — 7 項目と既存の正しい実装（前例）の対応表、REQ-295/301/313 との重複回避の相互参照 |
| [02-issues-a-b.md](REQ-315-minor-ux-and-ops-hygiene/02-issues-a-b.md) | 問題A（二重送信の同期ガード適用漏れ 3 系統）と問題B（`toLocaleString('ja-JP')` 固定・blob URL 未解放） |
| [03-issues-c-d.md](REQ-315-minor-ux-and-ops-hygiene/03-issues-c-d.md) | 問題C（サインアウトが await/catch されず unhandled rejection）と問題D（処理中でも背景タップ・Escape で閉じられる） |
| [04-issues-e-f-g.md](REQ-315-minor-ux-and-ops-hygiene/04-issues-e-f-g.md) | 問題E（未クリア `setTimeout` 3 箇所）、問題F（`/dashboard` の h1 欠落）、問題G（実行リージョン未固定と `vercel.json` 全文・対象 ISR/動的ルート一覧） |
| [05-functional-requirements.md](REQ-315-minor-ux-and-ops-hygiene/05-functional-requirements.md) | 機能要件 FR-315-01〜09（各問題への対処と回帰テスト） |
| [06-acceptance-criteria.md](REQ-315-minor-ux-and-ops-hygiene/06-acceptance-criteria.md) | 受入基準 AC-01〜11（i18n 4 言語、lint/type-check/既存652テストを含む） |
| [07-notes-to-confirm.md](REQ-315-minor-ux-and-ops-hygiene/07-notes-to-confirm.md) | 備考（要確認）— Toast の到達可否、`useEscapeKey` のシグネチャ変更影響、`hnd1` の選定根拠、計測条件、REQ-299 との切り分け |
