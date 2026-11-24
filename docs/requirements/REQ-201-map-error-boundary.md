# REQ-201: 地図区画専用のエラーバウンダリ追加と ErrorBoundary フォールバックの i18n 化

## 背景
ザリダス (Next.js 15 + react-leaflet) のホームは地図がコア機能で、`MapView` は重い依存（`leaflet` / `leaflet.heat` / `react-leaflet-cluster`）を持つため `dynamic import` + ローディングスケルトンで遅延ロードされる（`src/components/features/map/MapViewWrapper.tsx`）。しかし**地図区画専用のエラーバウンダリが無い**ため、地図チャンクのロード失敗や leaflet 描画時の例外がアプリ全体のエラー境界まで貫通し、地図と無関係なフィルタバー・写真ギャラリーまで巻き添えでエラー画面に置き換わる。あわせて、既存のクラスコンポーネント版 `ErrorBoundary` のフォールバック文言が日本語固定で、多言語（ja/en/ko/zh）対応のアプリ方針から外れている。

実コードを確認した上での現状は以下の通り（2 課題は独立して着手可能）。

## 現状の問題
（ファイルパス:行番号つき）

### 1. 地図区画専用の ErrorBoundary が無く、地図のエラーがホーム全体を巻き込む
- `ErrorBoundary`（`src/components/ui/ErrorBoundary.tsx`）はアプリ内で 2 箇所のみで使用：
  - `src/app/providers.tsx:97-125`（アプリ全体を包む最上位）
  - `src/app/admin/AdminLayoutClient.tsx:19-21`（管理画面）
- 地図は `src/app/(home)/HomeInteractive.tsx:10` で `MapView`（= `MapViewWrapper`）を import し、内部関数コンポーネント `MapGalleryPager`（`HomeInteractive.tsx:273` で定義）の `HomeInteractive.tsx:319` で `<MapView ... />` を描画している。
- `MapViewWrapper.tsx:28-31` は `dynamic(() => import('./MapView'), { ssr: false, loading: () => <MapSkeleton /> })` で**ローディングスケルトンのみ**を持ち、エラー時のフォールバックを持たない。
- そのため、(a) 地図チャンクのネットワーク失敗、(b) leaflet / leaflet.heat の初期化・描画時の例外は、地図枠内で止まらず最上位 `providers.tsx` の `ErrorBoundary` まで伝播し、**ホーム全体が「エラーが発生しました＋ページを再読み込み」に置き換わる**。地図以外（フィルタバー・写真ギャラリー・調査依頼など）も同時に消える。
- 地図はチャンクが大きく `ssr: false` で遅延ロードされるぶん失敗確率が相対的に高く、局所フォールバックの価値が大きい。

### 2. ErrorBoundary のフォールバック文言が日本語固定（多言語非対応）
`src/components/ui/ErrorBoundary.tsx` はクラスコンポーネントで、フォールバック UI の文言がハードコードされている：
- `:35-37` 見出し「エラーが発生しました」
- `:38-40` 本文「予期しないエラーが発生しました。ページを再読み込みしてください。」
- `:41-46` ボタン「ページを再読み込み」

アプリは i18next で ja/en/ko/zh を提供しているが、クラスコンポーネントはフックの `useTranslation()` を直接使えないため未対応のまま放置されている。`src/app/error.tsx`（関数コンポーネントの GlobalError）も現状は日本語リテラルを持つが、本 REQ では再利用が多いクラス版 `ErrorBoundary` の i18n を主対象とする。

## 目的
- 地図の失敗を地図枠の中に閉じ込め、フィルタ・ギャラリー等の周辺 UI を生存させたまま、地図だけを「再試行できるフォールバック」に差し替える。
- 共有 `ErrorBoundary` のフォールバック文言を 4 ロケール対応にし、多言語ユーザーに正しい言語でエラーと復帰導線を提示する。

## 要件
### 機能要件
- [ ] FR-201-01: `MapGalleryPager`（`src/app/(home)/HomeInteractive.tsx:319` 付近）の `<MapView />` を、地図枠サイズのフォールバックを持つエラーバウンダリで包む。既存 `src/components/ui/ErrorBoundary.tsx` を流用するか、地図用に `fallback` を差し込めるよう拡張し、フォールバックは**地図枠と同じ寸法（高さ）に収まり、再試行ボタンを持つ**こと。再試行でバウンダリの状態をリセットし、`MapView` の再マウント（チャンク再取得・再描画）を試みられること。
- [ ] FR-201-02: フォールバックは地図区画内に限定され、フィルタバー・写真ギャラリー・調査依頼など `MapGalleryPager` 外の UI を巻き込まないこと（地図のエラーが最上位 `providers.tsx:97` の `ErrorBoundary` まで伝播しない）。チャンクロード失敗時のフォールバック文言は「地図の読み込みに失敗しました」等、地図固有の文脈にする。
- [ ] FR-201-03: `src/components/ui/ErrorBoundary.tsx:35-46` のフォールバック文言（見出し / 本文 / ボタン）を i18n 化する。クラスコンポーネントから `i18n.t()`（`@/lib/i18n` の `i18n` インスタンスを直接 import 等）で翻訳キーを参照し、ja/en/ko/zh の 4 ロケールに対応させる。
- [ ] FR-201-04: 上記で使用する翻訳キー（例 `errorBoundary.title` / `errorBoundary.description` / `errorBoundary.reload`、地図用 `errorBoundary.mapTitle` / `errorBoundary.mapRetry` 等）を `src/locales/{ja,en,ko,zh}/translation.json` の 4 ファイルすべてに追加する（`i18n:check` のパリティを満たす）。

### 非機能要件（該当する場合のみ）
- [ ] NFR-201-01: 地図フォールバックはダークモードに対応し（`MapSkeleton` と同様に `dark:` クラスを持つ）、地図枠のレイアウトを崩さないこと。
- [ ] NFR-201-02: クラス `ErrorBoundary` の i18n 化で、エラー発生時に `useTranslation` のフック制約に違反しない実装（`i18n` インスタンス直接参照など）を用いること。i18n 未初期化時でもフォールバック文言が（既定言語で）必ず表示されること。
- [ ] NFR-201-03: `componentDidCatch` 既存の `logError` 連携（`ErrorBoundary.tsx:25-27`）を維持し、地図エラーも従来どおりログ／Sentry へ記録されること。

## 受入条件
- [ ] AC-01: `MapView` を強制的にスローさせた場合、地図枠内に再試行ボタン付きフォールバックが表示され、同じページのフィルタバー・写真ギャラリーは引き続き表示されている（ホーム全体のエラー画面に置き換わらない）。
- [ ] AC-02: フォールバックの再試行ボタン押下でバウンダリがリセットされ、`MapView` の再マウントが試行される。
- [ ] AC-03: `src/locales/{ja,en,ko,zh}/translation.json` に新規エラーバウンダリ用キーが 4 言語そろって存在し、`npm run i18n:check` が通る。
- [ ] AC-04: 言語を en/ko/zh に切り替えた状態で `ErrorBoundary` フォールバックを発生させると、見出し・本文・ボタンが当該言語で表示される（日本語固定でない）。
- [ ] AC-05: `tsc --noEmit` / lint / `next build` が成功し、既存の `providers.tsx` / `AdminLayoutClient.tsx` の `ErrorBoundary` 利用にリグレッションが無い。

## 影響範囲
- `src/app/(home)/HomeInteractive.tsx`（`MapGalleryPager` 内の `MapView` をバウンダリで包む）
- `src/components/ui/ErrorBoundary.tsx`（fallback 差し込み対応・i18n 化）
- `src/components/features/map/MapViewWrapper.tsx`（必要に応じてエラーフォールバックの寄せ先）
- `src/locales/{ja,en,ko,zh}/translation.json`（翻訳キー追加）

## 優先度
- **緊急度**: Medium / **重要度**: Medium / **理由**: 平常時は問題ないが、地図は遅延ロードかつ重依存で失敗確率が相対的に高く、失敗時にホーム全体が落ちるのは UX 上の影響が大きい（地図が一時的に出ないだけで済むはずが、投稿閲覧もできなくなる）。i18n 固定は多言語ユーザーへの一貫性欠如。どちらも既存資産の流用で対応でき、堅牢性・国際化の改善として中優先。
