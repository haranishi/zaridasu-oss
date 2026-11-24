# REQ-068: 周辺のいきものボトムシート

## 背景
Biome アプリのホーム画面は、地図を背景レイヤーに固定したまま、下部から引き上げ可能な半透過シートに「このエリアの最新の投稿」リストを載せている。地図とリストを左右・上下で分割するのではなく、同一平面にオーバーレイすることでどちらも最大領域で見られる。

本アプリの `src/views/HomePage.tsx:238-295` では、モバイル時にセグメントコントロール（`:171-235`）で「地図」「一覧」をトグルし、PC では左 72〜96px の縦分割表示にしている。結果、モバイルユーザーは「地図を見るか／リストを見るか」の二者択一を強いられ、地図上のマーカーを見ながら詳細リストを同時にスキャンできない。Biome 風の引き上げシートに刷新することで、この分断を解消する。

## ユーザーストーリー
As a 近所の生きもの発見リストを地図と同時に確認したいモバイルユーザー,
I want to 地図の下から引き上げられるシートに「近く」の投稿一覧が半透過で重なっていて、地図を見ながら投稿詳細もスクロール閲覧できる,
So that 画面切替なしで「マーカー位置 ↔ 投稿カード」の対応付けが直感的に取れる。

## 現状の問題
- `src/views/HomePage.tsx:171-235` — モバイル用「地図／一覧」セグメントコントロール。タブ切替式のため同時閲覧ができない。
- `src/views/HomePage.tsx:240-277` — モバイルでは `activeTab === 'list'` の時だけ `PostList` が可視になり、地図が完全に隠れる。
- `src/views/HomePage.tsx:247-267` — 件数サマリーバー（「N 件ロードしました」）があるが、地図閲覧中は目に入らない。
- `src/views/HomePage.tsx:284` — 地図パネルもタブで切り替わる前提で `hidden` / `flex` を切っており、ボトムシートレイアウトへの移行には再構成が必要。
- スワイプジェスチャー（ドラッグで高さを変える）に対応しているライブラリが現状プロジェクトに存在しない（`vaul` や `@radix-ui/react-dialog` の導入検討要）。

## ユーザーストーリー補足
- collapsed 状態: 画面下部に 80px の薄いバー（件数サマリー + 引き上げハンドル）のみ表示。地図は 100% 可視。
- expanded 状態: シートが 60vh まで上がり、`PostList` のカードを半透過シートの中でスクロール閲覧できる。地図はシートの下に残る。

## 要件

### 機能要件
- [ ] FR-068-01: モバイル（`md:hidden`）では現行のセグメントコントロールと `activeTab` 切替を撤去し、地図フルスクリーン + ボトムシートのレイアウトに置き換える。
- [ ] FR-068-02: ボトムシートは 2 段階スナップ（`collapsed: 80px`、`expanded: 60vh`）。上スワイプで展開、下スワイプで縮小。ハンドルタップでもトグル。
- [ ] FR-068-03: collapsed 時はシート内に以下のみ表示。
  - 引き上げハンドル（幅 40px × 高さ 4px）
  - 「周辺のいきもの {N} 件」サマリーテキスト
  - 右端に現在の並び順バッジ（例: 「新しい順」）
- [ ] FR-068-04: expanded 時はシート内に `PostList` をそのまま表示し、内部スクロールでカードを閲覧できる。シート上端（ハンドル含む）はスクロールしても常にピン留め。
- [ ] FR-068-05: 投稿カードのタップで地図のマーカーにフォーカス（`map.flyTo([lat, lng], zoom)`）する既存ハンドラがあればそれを維持。無ければ今後の拡張として `onPostSelect` を propagate できるよう interface を用意。
- [ ] FR-068-06: PC では既存の左サイドパネル分割（`md:w-72 lg:w-80 xl:w-96`、`HomePage.tsx:244`）をそのまま維持する。ボトムシートはモバイル限定。
- [ ] FR-068-07: `boundsFilterEnabled`（REQ-067）がオンの間は、件数サマリーを「このエリア {N} 件 / 全体 {T} 件」に切り替える（既存 `displayedPosts` / `posts.length` の差分表示ロジック `:257-263` を踏襲）。

### 非機能要件
- [ ] NFR-068-01: ハンドル・サマリーバーのタップターゲット ≥ 44×44 px。
- [ ] NFR-068-02: シートのスナップアニメは 250ms 以内、`cubic-bezier(0.32, 0.72, 0, 1)` 等の滑らかなイージング。`prefers-reduced-motion: reduce` で即時切替。
- [ ] NFR-068-03: dark variant 対応。背景は半透過（`bg-white/95` / `bg-slate-900/95`）+ `backdrop-blur-md`。
- [ ] NFR-068-04: シート内の `PostList` スクロールとページ全体のスクロール（body）を競合させない。overscroll は `overscroll-contain`。
- [ ] NFR-068-05: `safe-area-inset-bottom` に対応し、`collapsed` 時もホームインジケータと被らない。
- [ ] NFR-068-06: 導入ライブラリ（`vaul` もしくは `@radix-ui/react-dialog` + 自前ドラッグロジック）のバンドル増加を 20KB 以内に抑える。`vaul` は約 15KB gzip で推奨候補。
- [ ] NFR-068-07: シートが `expanded` の間、`BottomNav`（`:298-301`、REQ-064）は非表示ではなく通常どおり前面に残す（シートの下端がナビ上端に重ならないよう `expanded: calc(60vh - 56px)` 調整）。

## デザイン仕様

### レイアウト
| 項目 | サイズ |
| --- | --- |
| シート width | 100vw |
| collapsed 高さ | 80px + `env(safe-area-inset-bottom)` |
| expanded 高さ | 60vh（最大 `calc(100vh - 56px - ヘッダー)`） |
| シート角丸 | `rounded-t-2xl`（24px） |
| 上端ハンドル | 幅 40px × 高さ 4px、`rounded-full`、`my-2` |
| ハンドル領域（タップ用） | 幅 80px × 高さ 24px（ハンドルの周囲） |
| サマリーバー | 高さ 48px、`px-5`、`font-semibold` 15px |
| サマリー右バッジ | 12px / `px-2 py-0.5 rounded-full` |
| シート影 | `shadow-xl shadow-black/20` 上辺のみ |

### 配色（既存パレット準拠）
- シート背景: ライト `bg-white/95 backdrop-blur-md`、ダーク `bg-slate-900/95 backdrop-blur-md`
- 上辺ボーダー: ライト `border-gray-200`、ダーク `border-slate-700/60`
- ハンドル: ライト `bg-gray-300`、ダーク `bg-slate-600`
- サマリーテキスト: ライト `text-gray-800`、ダーク `text-slate-100`
- バッジ: ライト `bg-gray-100 text-gray-600`、ダーク `bg-slate-800 text-slate-300`

### 状態
- collapsed: 高さ 80px、ハンドル + サマリー行のみ。
- dragging: ユーザー指の y 座標を追従、スナップポイント表示用ガイドライン（任意）。
- expanded: 60vh、`PostList` フルスクロール可。
- 慣性スナップ中: `transition-transform duration-200 ease-out`。
- focus-visible: ハンドルに `ring-2 ring-red-400 ring-offset-2`。

## 受入条件
- [ ] AC-068-01: 375×812 でページを開いた直後、シートは collapsed（80px）で表示され、地図は画面ほぼ全面で視認できる。
- [ ] AC-068-02: ハンドルを上方向にスワイプするとシートが 60vh まで展開する。下方向スワイプで collapsed に戻る。
- [ ] AC-068-03: ハンドルタップだけでも expand/collapse がトグルできる（アクセシビリティ上必須）。
- [ ] AC-068-04: expanded 中に `PostList` を内部スクロールしても、body は固定で背景地図が動かない。
- [ ] AC-068-05: `boundsFilterEnabled` が true のときサマリーが「このエリア N 件 / 全体 T 件」の表示に切り替わる。
- [ ] AC-068-06: `BottomNav` の FAB（REQ-064）はシートが expanded でも視覚的に重ならない（z-index とシート最大高で担保）。
- [ ] AC-068-07: PC サイズでは既存の左サイドパネル表示に変化がない（スクリーンショット回帰）。
- [ ] AC-068-08: Axe / VoiceOver でシートが `role="dialog"` と `aria-expanded` でアナウンスされ、キーボードでも開閉可能（Space / Enter）。
- [ ] AC-068-09: 導入ライブラリを含めたバンドル増加がモバイル初期 JS で 25KB 以内（測定スクリプトで検証）。

## 影響範囲
- 新規: `src/components/features/home/NearbyPostsSheet.tsx`
- 変更: `src/views/HomePage.tsx`
  - `:171-235` セグメントコントロール削除
  - `:238-295` の flex 分割から、モバイル時は地図 absolute フル + シートオーバーレイへ構造変更
  - `activeTab` 関連 dispatch / reducer ケース（`SET_ACTIVE_TAB`）を削除 or PC 用途に限定
- 連動: REQ-064（FAB の z-index 整理）、REQ-065（フィルター pill との重なり）、REQ-067（このエリアを検索 FAB の配置）
- 依存候補: `vaul` ライブラリの追加（`package.json`）、または `@radix-ui/react-dialog` + `framer-motion` の代替構成

## 優先度
- **緊急度**: Medium
- **重要度**: Medium
- **理由**: モバイル地図 UX の最終形に直結するが、実装難度（ジェスチャー・スナップ・スクロール競合）が高く、REQ-063〜REQ-067 の前提整理が済んでから着手するのが合理的。効果量は大きいが段階的に導入する前提で Medium とする。
