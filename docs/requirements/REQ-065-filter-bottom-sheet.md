# REQ-065: フィルターをボトムシート化

## 背景
Biome アプリは地図画面で常駐するクロムを最小化し、絞り込み UI は必要な時だけ引き出すボトムシートで提供している。本アプリの `src/views/HomePage.tsx:156-161` では `FilterBar`（検索 + フィルターボタン + 期間セグメント + エリア内トグル）が地図上部に常駐しており、`FilterBar` の高さに加えて `StatsBar` (`:162`)、`HowToSection` (`:163-165`)、`MiniProfile` (`:168`)、タブ切替 (`:171-235`) が積み上がって、地図ビューポートが実質 50% 以下に潰れている。

Biome 風のレイアウトでは、地図を全画面で見せつつ、フィルター・現在のアクティブフィルター数を示す小さな pill ボタンを地図の左上（または右上）に浮かせ、タップでボトムシートが下から立ち上がる設計が定石である。

## ユーザーストーリー
As a スマホで地図を使って近場の生きもの情報を探したいユーザー,
I want to 画面のほぼ全面で地図を見ながら、絞り込みたいときだけフィルターパネルをサッと呼び出したい,
So that スクロールやズーム操作の邪魔をされず、期間・種類・自分の投稿などの切替も数タップで完了できる。

## 現状の問題
- `src/views/HomePage.tsx:156-161` — `FilterBar` が地図パネルの外側に常駐し、Flex の `shrink-0` で縦方向に約 48px（検索行）+ 期間タブ等で合計 90〜150px を占有。
- `src/views/HomePage.tsx:162-165` — `StatsBar`・`HowToSection` も地図上に積み上がり、フィルターより優先度の低い情報が地図を隠している。
- `src/views/HomePage.tsx:171-235` — モバイル用「地図 / 一覧」セグメントコントロール（パディング込みで約 52px）。
- `src/components/features/dashboard/FilterBar.tsx:68-73` — 検索 + フィルターボタン行の `border-b px-3 py-2`。モバイルで常時表示される設計そのものが課題。
- `src/views/HomePage.tsx:156-161` の `boundsFilterEnabled` トグルは現状 `FilterBar` に埋め込まれており、「みんなの投稿 / 自分のみ」のような新しい軸を足しづらい。

## 要件

### 機能要件
- [ ] FR-065-01: モバイル（`md:hidden`）では地図パネル上に常駐するフィルター UI を撤去し、代わりに地図の右上または左上に「フィルターアイコン（`SlidersHorizontal`）＋ アクティブチップ数バッジ」の pill 型ボタンのみを浮遊表示する。
- [ ] FR-065-02: pill をタップするとボトムシート（高さ `50vh`〜`70vh` 可変）が下から立ち上がり、以下を収める。
  - 期間セグメント（7日 / 30日 / 90日 / 全期間）
  - 投稿スコープのカードトグル（「みんなの投稿 / 自分のみ」2 択、ログイン時のみ表示）
  - 種類フィルター（複数チップ、既存 `SPECIES` 定数）
  - 自治体セレクト（既存 `MUNICIPALITIES`）
  - 並び替え（新しい順 / 古い順 / 種類別）
  - 下部固定の「クリア」「適用」ボタン（`w-full` 2 カラム）
- [ ] FR-065-03: ボトムシート外側の背景は `bg-black/50` で半透明にし、タップで閉じる。閉じる際は「キャンセル」扱いで変更は破棄する。
- [ ] FR-065-04: 「適用」タップ時のみ `onChange(filters)` を親 `HomePage` に通知し、ボトムシートを閉じる。「クリア」は `DEFAULT_FILTERS` にリセットするがシートは開いたまま。
- [ ] FR-065-05: `boundsFilterEnabled`（エリアで絞り込み）は引き続き `HomePage` 側の reducer 管理のままだが、ボトムシート内のスコープトグルとは独立の UI（REQ-067 の pill FAB 経由）とする。
- [ ] FR-065-06: PC（`md:flex`）では既存の横長 `FilterBar` をそのまま残し、ボトムシートは起動しない。
- [ ] FR-065-07: pill ボタンは現在アクティブなフィルター数をバッジで表示（既存 `activeCount` ロジックを流用、`FilterBar.tsx:35-41`）。0 の場合はバッジ非表示。

### 非機能要件
- [ ] NFR-065-01: pill ボタン本体 + ヒットエリアで最小 44×44 px。ボトムシート内の各行も最低 48px 高さ。
- [ ] NFR-065-02: ボトムシート開閉アニメは `translate-y` + `opacity` で 250ms 以内。`prefers-reduced-motion: reduce` でフェードのみ。
- [ ] NFR-065-03: dark variant 対応（`bg-slate-900` / `bg-white`、`text-slate-200` / `text-gray-700` 等）。
- [ ] NFR-065-04: ボトムシート展開中は `body` に `overflow: hidden` を付与し背面スクロールを抑止。ESC キーで閉じる（既存 `useEscapeKey` を再利用）。
- [ ] NFR-065-05: フォーカストラップ（`role="dialog"` + `aria-modal="true"`）を備え、シート内でフォーカスが循環する。
- [ ] NFR-065-06: `safe-area-inset-bottom` を下部アクションバーの `paddingBottom` に適用、ホームインジケータと重ならない。

## デザイン仕様

### レイアウト
| 項目 | サイズ |
| --- | --- |
| pill ボタン位置 | 地図右上（`top-3 right-3`、絶対配置） |
| pill 本体 | 高さ 40px、横 `auto`（padding `px-3`） |
| pill 影 | `shadow-lg shadow-black/10` |
| バッジ | 直径 18px、背景 `bg-red-500`、文字 11px / 白 / `font-bold` |
| ボトムシート width | 100vw |
| ボトムシート初期高さ | 60vh（ハンドルで手動リサイズは v2 で検討） |
| シート角丸 | `rounded-t-2xl`（24px） |
| シート上部ハンドル | 幅 40px × 高さ 4px、`bg-gray-300` / `bg-slate-600`、中央配置 |
| シート内 padding | `px-5 pt-3 pb-28`（下部アクション用余白） |
| 下部アクションバー | `fixed bottom-0`、高さ 72px、`border-t` |
| 適用ボタン | `bg-red-500 text-white`、`w-full`、`py-3`、`rounded-xl` |
| クリアボタン | アウトライン、`w-full`、`py-3` |
| 2 ボタン間の gap | 12px（`gap-3`） |

### 配色（既存パレット準拠）
- シート背景: ライト `bg-white`、ダーク `bg-slate-900`
- 境界線: ライト `border-gray-200`、ダーク `border-slate-700/60`
- オーバーレイ: `bg-black/50`
- アクティブチップ: `bg-red-500 text-white`、非アクティブ: `bg-gray-100 text-gray-700` / `bg-slate-800 text-slate-300`

### 状態
- default: pill ボタンのみ表示、シートは `translate-y-full` で非表示。
- open: シート `translate-y-0`、オーバーレイ `opacity-100`。
- scope toggle active（「自分のみ」選択時）: カードトグルが `ring-2 ring-red-400`。
- 未ログイン時の「自分のみ」: `disabled` で透明度 50% + ツールチップ「ログインすると絞り込めます」。
- focus-visible: 全インタラクティブ要素に `ring-2 ring-red-400 ring-offset-2`。

## 受入条件
- [ ] AC-065-01: 375×812 で HomePage を開いたとき、地図の縦可視領域が 75% 以上を占めること（開発者ツールで計測）。
- [ ] AC-065-02: pill タップ → ボトムシートが 250ms 以内で 60vh までせり上がる。背景が半透明化する。
- [ ] AC-065-03: シート外タップ・ESC・「キャンセル」ジェスチャー（下方向スワイプ）で変更を破棄してシートが閉じる。
- [ ] AC-065-04: 「適用」タップで `filters` が更新され、`usePostList` の再 fetch がトリガされる。
- [ ] AC-065-05: 「クリア」タップで UI 上のみリセットされ、シートは開いたまま（ユーザーが続けて適用 or キャンセルを選べる）。
- [ ] AC-065-06: ログイン済みで「自分のみ」を選んで適用した場合、`posts` が `author_id === user.id` に限定される。
- [ ] AC-065-07: PC では既存 `FilterBar` が従来どおり表示され、pill・ボトムシートは一切レンダリングされない。
- [ ] AC-065-08: Axe 検査で WCAG 2.1 AA 違反 0 件（`role="dialog"`、`aria-modal`、ラベル関連）。

## 影響範囲
- 新規: `src/components/features/dashboard/FilterBottomSheet.tsx`
- 新規: `src/components/features/dashboard/FilterPillButton.tsx`
- 変更: `src/components/features/dashboard/FilterBar.tsx`（モバイル部のみ削除、PC は維持）
- 変更: `src/views/HomePage.tsx`（`:156-161` を分岐し、`md:hidden` でボトムシートを `relative` な地図コンテナに配置）
- 変更: `src/components/features/map/MapView.tsx`（pill を重ねる absolute レイヤーのクラス衝突に注意）
- 依存候補: `@radix-ui/react-dialog` または自前実装（既存にあれば再利用）

## 優先度
- **緊急度**: High
- **重要度**: High
- **理由**: 地図は本アプリの主役コンテンツで、可視領域の圧迫は UX 全体の体感品質を大きく下げている。ボトムシート化は情報量を犠牲にせず地図を最大化できるため、費用対効果が高い。
