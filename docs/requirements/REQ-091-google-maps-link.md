# REQ-091: 詳細ページに「Google Maps で開く」ボタンを追加

> **位置づけ**: 既存ユーザー向け UX 改善
> **作成日**: 2026-04-25
> **ステータス**: TODO（実装未着手）
> **関連要件**: REQ-084（調査依頼）/ REQ-086（結果投稿フロー: 現地に行って投稿する動線）
> **優先度**: P1（実利用で離脱要因になっているため早めに解消）

---

## これは何か

調査依頼詳細 `/request/[id]` と投稿詳細 `/post/[id]` に、Google Maps を新しいタブで開くボタンを 1 つ足すだけの要件。
本文は全文を下の部品ファイルへ逐語で移動してある（この入口の要約部分のみ新規記述）。

## 目的・背景の要約

埋め込みの Leaflet / OpenStreetMap は静的な点を表示するだけで、経路案内ができない。ユーザーは緯度経度を手でコピペして Google Maps に貼り直している。調査依頼は「現地に行って結果を投稿する」のがコア動線（REQ-086 / REQ-087）なので、ナビ動線が無いとループが切れる。これを最小コストで解消する。

## 主要な決定事項の要点

- **Google Maps Universal URL に一本化**。JavaScript API / Embed API / Directions API は使わない（API キーと利用料が不要になる）。
- **既定は経路モード** `https://www.google.com/maps/dir/?api=1&destination=<lat>,<lng>&travelmode=driving`。位置表示だけの `search` モードも Props で選べる。
- 共通コンポーネント **`src/components/common/OpenInGoogleMapsButton.tsx`** を新規作成し、2 つの詳細ページに 1 行ずつ差し込む。
- **新規 API / DB 変更 / 環境変数はすべてゼロ**。既存の `survey_requests.lat/lng`・`posts.lat/lng` を読むだけ。
- 座標は **小数 6 桁に丸めて** URL へ渡す（既存の位置情報粒度ポリシーと整合）。不正座標（NaN・範囲外）はボタンを描画しない。
- `target="_blank"` + `rel="noopener noreferrer"` を必須とし、同タブ遷移はしない。
- 対象は**詳細画面のみ**。一覧カードや Apple Maps / Yahoo!地図への切替は後続要件。
- 合計工数は **XS（数時間以内）**。

## 部品ファイル

| ファイル | 内容 |
|---|---|
| [01-overview.md](REQ-091-google-maps-link/01-overview.md) | 要件概要 — 背景・目的、スコープ（含む／含まない）、前提条件・制約 |
| [02-user-stories.md](REQ-091-google-maps-link/02-user-stories.md) | ユーザーストーリー US-091-01〜04（応答者の経路確認、地形確認、SR 対応、CTA 圧迫回避） |
| [03-functional-requirements.md](REQ-091-google-maps-link/03-functional-requirements.md) | 機能要件 FR-091-01〜05（コンポーネント Props と処理、2 ページへの組み込み、URL 仕様、サニタイズ） |
| [04-non-functional-requirements.md](REQ-091-google-maps-link/04-non-functional-requirements.md) | 非機能要件 — パフォーマンス、セキュリティ、可用性、アクセシビリティ（WCAG 2.1 AA）、レスポンシブ |
| [05-screen-spec.md](REQ-091-google-maps-link/05-screen-spec.md) | 画面仕様 SC-091-01〜03（両ページのレイアウト図とボタンのスタイル定義） |
| [06-api-data-migration.md](REQ-091-google-maps-link/06-api-data-migration.md) | API仕様（外部 URL 一覧）、データモデル・DB設計、マイグレーション計画 — いずれも新規なし |
| [07-impact-and-acceptance.md](REQ-091-google-maps-link/07-impact-and-acceptance.md) | 影響範囲（変更ファイルと推定行数、既存テストへの影響）と受け入れ基準 AC-091-01〜14 |
| [08-risks-plan-summary.md](REQ-091-google-maps-link/08-risks-plan-summary.md) | リスク・トレードオフ、実装優先度と計画、サマリーと次のアクション |
