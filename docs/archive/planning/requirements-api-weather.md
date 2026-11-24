> ⚠️ **アーカイブ（2026-07-18 / REQ-282 FR-282-B4）**: 歴史的文書（当時のスナップショット）。以後更新しない。現況は `docs/requirements/` の REQ 文書とインデックスを参照。

# 要件定義: API-002 気象庁API 天気データ自動付加

- **ID**: API-002
- **優先度**: 🟠 中（次フェーズ実装）
- **使用API**: 気象庁 天気予報 JSON API（無料・認証不要）
- **作成日**: 2026-03-15

---

## これは何か

投稿時に気象庁APIから天気・気温を自動で取得して記録する構想を 2026-03-15 に検討した当時の要件定義。本ファイルを入口とし、本文は同名ディレクトリ配下の部品に逐語で分割している。

## 目的・背景

投稿者に気象条件を手入力させるのは負担が大きく、埋まらない。自動で付けられれば「雨の日はザリガニが多い」といった相関を TrendsPage で分析でき、詳細ページでも「晴れ・28℃の日だった」という文脈が読めてデータの情報価値が上がる。

## 主要な決定事項（要点）

- 気象庁の公開JSON（`https://www.jma.go.jp/bosai/forecast/data/forecast/050000.json`）を**認証なし・完全無料**で直接叩く。秋田県コード `050000` は `constants.js` の定数 `JMA_AREA_CODE` として持つ。
- 位置ピン確定から**1秒以内**に呼び、フォームには読み取り専用バナーとして出す。
- **失敗はサイレント無視**（`weather = null` のまま投稿を継続させ、天気取得の失敗が投稿を妨げないようにする）。
- `posts` に `weather`（CHECK制約で `sunny`/`cloudy`/`rainy`/`snowy`/`unknown`）、`temperature_max`、`temperature_min` を追加し、`weather` にインデックスを張る。
- 実装は `useWeather` フックに閉じ、**`useReverseGeocode.ts` と同じパターン**（AbortSignal・オフライン検知・sessionStorage 5分キャッシュ）を踏襲する。
- TrendsPage の天気別内訳は、weather が全件 NULL のときセクションごと非表示にする（データが無い時期でも壊れないため）。
- CORS 制限なしを確認済み。将来制限されたら Supabase Edge Function プロキシに切り替える方針。

## 部品

- [01-user-stories.md](requirements-api-weather/01-user-stories.md) — 一般投稿者・研究者/行政・サイト訪問者のユーザーストーリー。
- [02-functional-requirements.md](requirements-api-weather/02-functional-requirements.md) — F1 自動天気取得、F2 DBスキーマ追加のDDL、F3 TrendsPage 天気別分析、F4 DetailPage 表示、F5 `useWeather` フックの型。
- [03-nonfunctional-and-implementation.md](requirements-api-weather/03-nonfunctional-and-implementation.md) — 非機能要件（コスト・キャッシュ・オフライン・CORS）と新規/変更ファイル一覧。
- [04-test-perspectives.md](requirements-api-weather/04-test-perspectives.md) — テスト観点4点（パース/キャッシュ/オフライン、バナー表示、失敗時の送信、全件null時のクラッシュ）。
