# REQ-144: 重い library (react-leaflet / fix-webm-duration) の静的 import を dynamic に切り替えバンドルを軽量化

## これは何か

`react-leaflet` と `fix-webm-duration` の**静的 import を残している 5 箇所**を dynamic 化して、
chunk の分割粒度を細かくするバンドル軽量化の要件。

## 目的・背景（要約）

`react-leaflet` / `leaflet` はモジュール評価時に `window` を参照するため、**ページ側では既に
`next/dynamic({ ssr: false })` で wrap されている**。しかし **wrap された側のコンポーネント内部が
`react-leaflet` を静的 import している**ため、動的 chunk の中に leaflet 一式が必ず入り、
PostForm → LocationSection のような二重 wrap で分割粒度が荒くなっている。
録音時にしか使わない `fix-webm-duration` も同様に AudioRecorder の chunk に常時含まれている。

REQ-026 / REQ-046 / REQ-111 / REQ-124 で部分的な対策は入っているが、`LocationSection` /
`MiniMap` / `ReviewCardMiniMap` / `SurveyRequestForm` と `fixWebmDuration.ts` が未対応。

## 主要な決定事項（要点）

- 目標は「初回描画 chunk」だけでなく「**モーダルを開いた瞬間に取得する chunk**」からも leaflet を切り離し、
  **地図が実際に表示されるときにだけ**取得する形に統一すること。
- `ReviewCardMiniMap` は **実測で判定**する。親 `ReviewCard` で既に dynamic 済みで初期バンドルへの影響は
  小さいため、bundle-analyzer で許容範囲なら**理由付きで NoOp** とし、その結果を本要件に追記する。
- `fix-webm-duration` は `recorder.onstop` 内でしか使わないので `await import(...)` で十分。
  **単独で完結する低リスク変更なので先行投入も可**。
- dynamic 化した箇所には**高さを保つ loading skeleton** を必ず置き、CLS を増やさない。
- `.size-limit.json` に二次チャンク（SurveyRequestForm / PostForm または LocationSection）の監視を追加する。
  初期閾値は**実測値 + 5%**。
- 緊急度 Medium / 重要度 High。機能は壊れていないが、後段の地図 UI 拡張が走る前にやっておく**ベース工事**。
  DB スキーマ・RLS・Edge Functions・送信ロジック・Leaflet 表示後の挙動には影響しない。

## 各部品

| ファイル | 内容 |
|---|---|
| [01-background-and-problems.md](REQ-144-leaflet-webm-dynamic-import/01-background-and-problems.md) | 背景と現状の問題 1〜6（該当ファイル・行番号と、各箇所で何が起きているか／bundle 計測の不確実性） |
| [02-goals-and-requirements.md](REQ-144-leaflet-webm-dynamic-import/02-goals-and-requirements.md) | 目的と機能要件 FR-144-01〜08（各コンポーネントの dynamic 化・`patchWebmDuration` の実装例・size-limit 追加・analyze 再実行）、非機能要件 NFR-144-01〜04 |
| [03-acceptance-and-tests.md](REQ-144-leaflet-webm-dynamic-import/03-acceptance-and-tests.md) | 受入条件 AC-01〜09（grep 条件・Network タブでの確認）とテスト要件（ユニット／E2E／バンドル計測） |
| [04-impact-and-priority.md](REQ-144-leaflet-webm-dynamic-import/04-impact-and-priority.md) | 影響範囲（変更対象ファイル・影響しないこと）と優先度・理由 |
