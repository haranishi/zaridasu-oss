/**
 * REQ-320 FR-320-05: ページの「縦の線」を決める唯一の場所。
 *
 * ■ なぜ要るのか
 * 1440px で左端が **4 本**に割れていた（Round 1 採点 #3）:
 *   検索窓 x=12 / ハンバーガー x=98 / パンくず x=17 / 本文カード x=352。
 * 原因は「コンテナ幅と左パディングを書く場所がコンポーネントごとにバラバラ」だったこと。
 *   - Header       … `max-w-(--breakpoint-xl)`(1280) + px-4  → 1440 で x=96
 *   - Breadcrumb   … コンテナ無し + px-4                     → x=16
 *   - 各ページ本文 … `max-w-3xl`(768) / `max-w-2xl`(672) + px-4 → x=352 / x=400
 * 幅の数値を各所に書いている限り、直してもまた割れる。**定数を 1 つにする**のが本質的な対処。
 *
 * ■ 使い方
 * ページの chrome（ヘッダー・パンくず・検索バー）と本文コンテナに `PAGE_CONTAINER` を当てる。
 * 縦の余白や `space-y-*` はレイアウト都合で違うので、呼び出し側で足す。
 *
 * ■ なぜ 3xl（768px）なのか
 * 既存ページ（ranking / trends / area / dataset / species / collection / dashboard）が
 * 既に `max-w-3xl` を使っており、変更量が最小で済む。`--measure`(42rem) は本文 1 段の
 * 読みやすさ基準で、カードを 2 列並べる面には狭すぎるためここでは採らない。
 */
export const PAGE_MAX_WIDTH = 'max-w-3xl'

/** 左右パディング。8pt グリッド（--space-2 = 16px）に合わせる。 */
export const PAGE_PADDING_X = 'px-4'

/** ページ内で左端を揃えるべき要素すべてに当てるコンテナ。 */
export const PAGE_CONTAINER = `mx-auto w-full ${PAGE_MAX_WIDTH} ${PAGE_PADDING_X}`

/**
 * REQ-320 FR-320-01: BottomNav（`fixed bottom-0` / `h-14` = 56px）に隠れないための
 * 本文下部の逃げ幅。「ナビ高さ + 16px」＋ iOS のセーフエリア。
 *
 * 既存ページの `pb-20 md:pb-0` は **md 以上でナビが消える前提**の名残で、実際には
 * BottomNav は全幅で出る（1440 のスクショでも下端に出ている）。新規に足す 4 ページでは
 * その取り違えを持ち込まず、実寸から計算した値を使う。
 */
export const BOTTOM_NAV_SPACER_HEIGHT = 'calc(4rem + 1rem + env(safe-area-inset-bottom, 0px))'
