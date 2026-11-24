## 要件概要

### 背景・目的
ザリダスでは、調査依頼詳細 (`/request/[id]`) と通常の投稿詳細 (`/post/[id]`) で `MiniMap` / `DetailMap`（Leaflet + OpenStreetMap）を埋め込んで地点を表示している。しかし以下の課題がある:

- **ナビゲーションができない**: 表示されているのは静的な点のみで、「ここに行こう」と思っても道のり / 経路を確認できない
- **座標を手でコピペ**: 緯度経度のテキストを Google Maps に貼り直して開くという余計な手数が発生
- **調査依頼の応答者は実際に現地へ行く**: REQ-087（協力する）/ REQ-086（結果投稿）で「現地に行って投稿する」動線がコア。ナビ動線が無いとループが切れる

ユーザーの要望:「ボタン1つで Google Maps 上で位置を見れるようにしてほしい」を最小コストで実現する。

### スコープ
**含む:**
- `SurveyRequestPage`（`/request/[id]`）の地点表示エリアに「📍 Google Maps で開く」ボタンを追加
- `DetailPage`（`/post/[id]`）の地図カードに同等のボタンを追加
- ボタン押下で Google Maps の universal URL（`https://www.google.com/maps/search/?api=1&query=<lat>,<lng>`）を新しいタブで開く
  - モバイルで Google Maps アプリがインストールされていれば OS が自動でアプリへ遷移（iOS / Android 共通仕様）
  - 入っていなければブラウザでそのまま開く
- 共通化のため小さな `OpenInGoogleMapsButton` コンポーネントを `src/components/common/` に新規作成
- 「経路案内（dir）」モードも合わせて提供（現在地 → 地点）。実装は同じボタンの長押しメニューやセカンダリリンクではなく、**シンプルな単一ボタン**として「経路を表示」を採用するか、「位置を表示 / 経路を表示」の 2 ボタンで提供するかを決定
  - 推奨: **`/maps/dir/?api=1&destination=<lat>,<lng>&travelmode=driving` を採用した単一ボタン「Google Maps で経路を表示」**（より具体的に役立つアクションのため）

**含まない:**
- Google Maps JavaScript API / Embed API / Directions API による埋め込み（API キーと利用料が必要）
- ザリダス内蔵の経路案内 / 距離計算 / ルート最適化
- 投稿一覧カード / マイページカード / `/requests` 一覧カードへのボタン追加（詳細画面のみ）
- Apple Maps / Yahoo!地図 / 国土地理院地図への切替メニュー（後続要件で検討可）
- ディープリンクのプラットフォーム別切り分け（`comgooglemaps://` 等の独自スキーム）

### 前提条件・制約
- 既存テーブル `survey_requests` / `posts` の `lat`, `lng`（double precision）をそのまま利用
- 新規外部 API 呼び出しなし、認証不要、サーバーサイド処理なし
- iOS Safari / Android Chrome / PC ブラウザ全対応
- 新しいタブで開く（`target="_blank"` + `rel="noopener noreferrer"`）。同タブ遷移はザリダスから離脱になるので不可
- 既存レイアウト（`SurveyRequestPage` のメタカード / `DetailPage` の地図カード）を崩さない
- ダーク / ライトモード両対応、既存のボタンスタイル（`rounded-xl`, `bg-gradient-*` 等）に揃える
- a11y: `aria-label="Google Maps で経路を表示"`, キーボードフォーカス可、フォーカスリング表示

---
