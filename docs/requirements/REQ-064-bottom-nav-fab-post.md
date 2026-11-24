# REQ-064: ボトムナビ中央に FAB 投稿ボタン

## 背景
Biome アプリのボトムナビは 5 タブのうち中央だけを浮き出し型 FAB（Floating Action Button）にして投稿動線を強く訴求している。本アプリの `src/components/layout/BottomNav.tsx` も近い構造を持っているが、FAB のサイズ（48px）・影・配色のコントラストが弱く、通常タブと視覚的に同列に見えてしまう。投稿は本アプリの KPI 直結アクションのため、ビジュアルヒエラルキーを明確に分離したい。

現状の `BottomNav.tsx:15-21` では `TABS` 配列の 3 番目に `{ key: 'post', ... path: null }` が入っており、`:77-90` の早期 return で円形ボタンにはなっているものの、直径 48px / `-mt-4` / `shadow-lg shadow-red-500/30` と控えめで、他タブ（`:92-107`）の縦 56px カラムに埋もれて見える。

## ユーザーストーリー
As a 生きもの観察を投稿したいモバイルユーザー,
I want to 画面中央に常に目立つ投稿ボタンがあってワンタップで投稿フォームに入りたい,
So that 発見の興奮が冷めないうちに写真をアップロードでき、投稿コンバージョンが上がる。

## 現状の問題
- `src/components/layout/BottomNav.tsx:72` — ナビのコンテナ高さが `h-14`（56px）固定で、FAB が `-mt-4` しかはみ出さないため浮遊感が弱い。
- `src/components/layout/BottomNav.tsx:85` — FAB 直径が `w-12 h-12`（48px）。Material Design FAB 推奨（56px）より小さく、タップ精度も下がりがち。
- `src/components/layout/BottomNav.tsx:85-87` — 影が `shadow-lg shadow-red-500/30` のみ。ダークモード時 `border-t` ナビ背景とのコントラストが不足し、浮き感が曖昧。
- `src/components/layout/BottomNav.tsx:86` — `Plus size={24}` で中央に置かれているが、FAB 直下にラベル「投稿」が一切表示されない（他タブとの文字情報の非対称）。アクセシビリティ上 `aria-label="投稿する"` は付くが、視覚ラベルがないため初回ユーザーに機能推測を要求する。
- `src/components/layout/BottomNav.tsx:48-54` — 未ログイン時に `onLoginClick('signup')` を呼ぶロジックは既に存在。これは維持する。

## 要件

### 機能要件
- [ ] FR-064-01: `TABS` 配列の中央タブ（`key: 'post'`）を視覚的に独立した FAB として描画する。他 4 タブ（地図・統計・ランキング・マイページ）は従来の縦積みアイコン + ラベル構成を維持。
- [ ] FR-064-02: FAB は円形 56px 径。プライマリカラー（`bg-gradient-to-br from-red-500 to-rose-600` など既存パレット）、`shadow-xl shadow-red-500/40`、白アイコン `Plus size={26} strokeWidth={2.5}`。
- [ ] FR-064-03: FAB の直下にラベル「投稿」を 11px で表示し、他タブとのラベル位置を視覚的に揃える。ラベル色はアクティブ時のみ `text-red-500`、非アクティブ時は `text-slate-400 / text-gray-400`（他タブと同じ）。
- [ ] FR-064-04: 未ログイン時は既存ロジックどおり `onLoginClick('signup')` を発火（`BottomNav.tsx:48-54` を変更しない）。
- [ ] FR-064-05: FAB は画面上で `translateY(-18px)` 相当ぶん浮かせ、ナビ本体とオーバーラップさせる。ナビ自体の `h-14` は維持しつつ、FAB は背景より手前（`z-index` 1 段上）にレイヤーする。
- [ ] FR-064-06: FAB タップ時に `active:scale-95` のマイクロインタラクションを継続。加えて haptics（`navigator.vibrate(10)` を iOS 以外で）を任意で追加検討。

### 非機能要件
- [ ] NFR-064-01: タップターゲット ≥ 44×44 px（FAB 本体 56px + 周囲 `padding` で 64px 相当のヒットエリアを確保）。
- [ ] NFR-064-02: FAB の scale/shadow アニメ 250ms 以内。`prefers-reduced-motion: reduce` で `transition-none`。
- [ ] NFR-064-03: dark variant 対応。ダークモードでは背景 `bg-slate-950/95` に対し FAB の影を `shadow-black/60` に強化してコントラストを確保。
- [ ] NFR-064-04: `safe-area-inset-bottom` を既存どおり `paddingBottom` に反映（`BottomNav.tsx:70`）。FAB 浮き上がりとホームインジケータが干渉しないこと。
- [ ] NFR-064-05: `aria-label="投稿する"` に加え、視覚ラベル「投稿」を追加。スクリーンリーダー重複読み上げを避けるため `<span aria-hidden="true">投稿</span>` を使う。

## デザイン仕様

### レイアウト
| 項目 | サイズ |
| --- | --- |
| ナビ高さ | 56px（`h-14`、現行維持） |
| 他タブ（4 個）のカラム幅 | 均等（`justify-around`） |
| FAB 直径 | 56px（`w-14 h-14`） |
| FAB 上方向オフセット | -22px（`-mt-6` または `-translate-y-5`）でナビ上端から突き出し |
| FAB 内アイコン | `Plus` 26px / strokeWidth 2.5 / 白 |
| FAB 下ラベル | 11px / `font-semibold` / margin-top 2px |
| 他タブアイコン | 20px（現行維持） |
| 他タブラベル | 11px（現行維持） |

### 配色（既存パレット準拠）
- FAB 背景: `bg-gradient-to-br from-red-500 to-rose-600`（現行のまま）
- FAB 影（ライト）: `shadow-xl shadow-red-500/40`
- FAB 影（ダーク）: `shadow-xl shadow-red-500/30 ring-1 ring-black/40`
- FAB アイコン: `text-white`
- ラベル（アクティブ）: `text-red-500`
- ラベル（非アクティブ）: ライト `text-gray-500`、ダーク `text-slate-400`

### 状態
- default: FAB は常に浮遊表示。
- active（現在のパスが投稿フローに関連する場合）: 特別なアクティブ状態は持たない（投稿は path を持たないため）。代わりに押下中は `scale-95` + 影を一段濃く。
- hover（PC でデバッグ時）: `brightness-105`。
- disabled: 投稿フォーム送信中などで親から `disabled` prop を渡された場合は透明度 50% + `cursor-not-allowed`。

## 受入条件
- [ ] AC-064-01: 375×812 で FAB がナビ上端から 22px 突き出し、視線誘導が明確に中央に寄ること（スクリーンショット比較）。
- [ ] AC-064-02: ログイン済みでタップ → `PostForm` がオープンする。未ログインでタップ → `AuthModal` が `signup` タブで開く。
- [ ] AC-064-03: ラベル「投稿」が FAB の真下に表示され、他タブのラベル行と縦位置が揃っている（Flex のベースライン検証）。
- [ ] AC-064-04: iOS Safari でホームインジケータと FAB が重ならない（safe-area 反映の目視確認）。
- [ ] AC-064-05: Axe / VoiceOver で FAB がボタンとしてアナウンスされ、ラベルが 1 回だけ読み上げられる。
- [ ] AC-064-06: `VISIBLE_PATHS` 配列に含まれないルート（例 `/terms`）では従来どおりナビごと非表示になる。

## 影響範囲
- 変更: `src/components/layout/BottomNav.tsx`（`:77-90` の FAB ブロック、ラベル追加、影強化）
- 影響なし: `src/components/layout/Header.tsx`、`src/views/HomePage.tsx`、`src/components/features/posts/PostForm.tsx`
- 回帰テスト対象: 投稿導線（HomePage → PostForm → 成功後 `fetchPosts`）

## 優先度
- **緊急度**: High
- **重要度**: High
- **理由**: 投稿はアプリの中核コンバージョン。ボトムナビの視覚ヒエラルキーは投稿率に直結するため、Biome 風 FAB への格上げは効果量・実装コスト比が非常に高い。
