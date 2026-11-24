# REQ-067: 「このエリアを検索」FAB

## 背景
Google マップや Biome など地図ベースのアプリでは、ユーザーがマップをパン／ズームすると中央上部に「このエリアを検索」の pill 型 FAB がフェードインし、タップすると現在の表示領域に限定した再検索が走る設計が定着している。本アプリにも `boundsFilterEnabled`（地図範囲で絞り込む）機能は存在するが、ユーザーが任意で `FilterBar` 経由でトグルする必要があり、地図移動と検索意図のタイミングが噛み合っていない。

現状の `src/views/HomePage.tsx:289` で `onBoundsChange` により `mapBounds` は常に reducer へ流れ込んでおり、`MapView.tsx:150-161` の `BoundsWatcher` が `moveend` / `zoomend` で毎回発火する。あとはこのシグナルを拾って「再検索を促す FAB」を表示するレイヤーを追加するだけで、Biome 風の体験が実現できる。

## ユーザーストーリー
As a 地図をドラッグして関心エリアを絞り込んだユーザー,
I want to 手動でフィルターを触らなくても、動かした先の範囲だけで検索し直せる FAB が自動で現れる,
So that 探索のリズムを崩さず、視界に入っているエリアの投稿だけに集中できる。

## 現状の問題
- `src/views/HomePage.tsx:289` — `onBoundsChange` は `SET_MAP_BOUNDS` dispatch のみで、「検索し直すかどうか」はユーザーに意思表示手段がない。
- `src/components/features/map/MapView.tsx:150-161` — `BoundsWatcher` は mount 直後と move/zoom で発火する一方、「初期マウント時」と「ユーザーのパン」を区別しておらず、「動かしたかどうか」を検知する余地がない。
- `src/views/HomePage.tsx:156-161` の `FilterBar` 内トグル（`boundsFilterEnabled`）は存在感が薄く、パン後に気付きにくい。
- `src/views/HomePage.tsx:137-142` — `boundsFilterEnabled && mapBounds` で `posts.filter(...)` するフロント絞り込みはあるが、サーバ側で改めて fetch しない場合、表示件数が不足する（地図範囲内の投稿が page サイズを超えていると欠損する）。

## 要件

### 機能要件
- [ ] FR-067-01: `HomePage` に「地図が初期マウント以降にユーザー操作で動いたか」を保持する `hasMapMoved` ステートを追加する。`MapView` 側で初期マウントの `BoundsWatcher` 発火は除外するフラグを立てる。
- [ ] FR-067-02: `hasMapMoved === true` かつ `boundsFilterEnabled === false` の間、地図パネル中央上部（`absolute top-3 left-1/2 -translate-x-1/2`）に pill 型 FAB「このエリアを検索」を表示する。
- [ ] FR-067-03: FAB タップで以下を実行。
  - `dispatch({ type: 'TOGGLE_BOUNDS_FILTER' })`（`boundsFilterEnabled = true`）
  - `usePostList` を `mapBounds` 付きで再 fetch（既存 `options` 経路）
  - `hasMapMoved = false` にリセットし FAB を非表示に
- [ ] FR-067-04: `boundsFilterEnabled === true` 中にユーザーが再度地図を動かした場合は、FAB を「このエリアを再検索」のラベルで再表示する（`boundsFilterEnabled` を落として再度トグル）。
- [ ] FR-067-05: FAB は左右両端のマーカーや他 UI（REQ-065 のフィルター pill、REQ-068 のシートハンドル）と重ならないレイヤリングにする。`z-index` は地図マーカーより上、モーダルより下。
- [ ] FR-067-06: PC / タブレットでも同じ FAB を表示する（モバイルと同じ振る舞い）。

### 非機能要件
- [ ] NFR-067-01: FAB のタップターゲット ≥ 44×44 px（`py-2.5 px-4` で縦 44px 以上、横 `auto`）。
- [ ] NFR-067-02: 表示／非表示は 250ms 以内のフェード + `translate-y-1`。`prefers-reduced-motion` でフェードのみ。
- [ ] NFR-067-03: dark variant 対応（背景 `bg-white` / `bg-slate-900`、影 `shadow-lg`）。
- [ ] NFR-067-04: パン／ズームのデバウンスは 250ms（`moveend` が連発した際に FAB がチラつかないよう、`BoundsWatcher` 側で debounce するか `useEffect` 内で setTimeout）。
- [ ] NFR-067-05: `boundsFilterEnabled` が ON の間は `usePostList` の page サイズを十分確保し、フロント `filter` で欠損しないよう配慮（可能ならサーバ側のクエリに `ST_Within` / bbox 条件を追加し、将来的な最適化余地を残す）。

## デザイン仕様

### レイアウト
| 項目 | サイズ |
| --- | --- |
| FAB 位置 | 地図コンテナ内の `top: 12px`、水平中央 |
| FAB 高さ | 44px（`h-11`） |
| FAB padding | 左右 16px（`px-4`） |
| FAB 角丸 | `rounded-full` |
| 内部アイコン | `RefreshCw` または `Search`、16px、左マージン 0・右マージン 8px |
| ラベル | 14px / `font-semibold` |
| シャドウ | `shadow-lg shadow-black/10` |

### 配色（既存パレット準拠）
- 背景: ライト `bg-white`、ダーク `bg-slate-900`
- ボーダー: ライト `border border-gray-200`、ダーク `border border-slate-700/70`
- テキスト: ライト `text-gray-800`、ダーク `text-slate-100`
- アイコン: `text-red-500`（ブランドアクセント）
- focus-visible ring: `ring-2 ring-red-400 ring-offset-2`

### 状態
- hidden: `opacity-0 translate-y-1 pointer-events-none`
- visible: `opacity-100 translate-y-0 pointer-events-auto`
- pressed: `scale-95`
- loading（再 fetch 中）: ラベルを「検索中…」に差し替え、`RefreshCw` に `animate-spin` を付与。タップ無効。
- boundsFilterEnabled アクティブかつ hasMapMoved: ラベル「このエリアを再検索」。

## 受入条件
- [ ] AC-067-01: 初回マウント直後は FAB が非表示であること（自動で「このエリアを検索」が出ない）。
- [ ] AC-067-02: 地図をドラッグ → 停止して 250ms 以内に FAB がフェードインする。
- [ ] AC-067-03: FAB タップで `boundsFilterEnabled` が true になり、`usePostList` が `mapBounds` 付きで再 fetch される。
- [ ] AC-067-04: 再 fetch 完了後、FAB は非表示に戻る。
- [ ] AC-067-05: 既存の `FilterBar` の boundsFilter トグル（`:160-161`）とも整合が取れ、どちらから操作しても `boundsFilterEnabled` の値が同期する。
- [ ] AC-067-06: ダーク／ライト両テーマで視認性の WCAG AA コントラスト（4.5:1 以上）を確保。
- [ ] AC-067-07: Axe 検査で FAB がボタンとしてアナウンスされ、ラベル変更もスクリーンリーダーに伝わる（`aria-live="polite"` 推奨）。

## 影響範囲
- 変更: `src/views/HomePage.tsx`（`hasMapMoved` ステート、`BoundsWatcher` 連動ロジック、FAB のマウント）
- 変更: `src/components/features/map/MapView.tsx`（`BoundsWatcher` の初回呼び出し除外フラグ、もしくは親へ「ユーザー由来か」を通知）
- 新規: `src/components/features/map/SearchThisAreaFab.tsx`
- 参照: `src/hooks/usePostList.ts`（`boundsFilterEnabled` が既に options として渡されていることを確認）
- 連動: REQ-065（フィルター pill の位置）・REQ-068（ボトムシート高さ）と z-index / 位置衝突を調整

## 優先度
- **緊急度**: Medium
- **重要度**: Medium
- **理由**: 地図探索のコア UX を底上げする定番 UI で、ユーザーの明示的フィードバックも溜めやすい（「タップしたかどうか」を計測可能）。ただし機能自体は既存の `boundsFilterEnabled` の再利用で済むため、段階的に導入できる。
