/**
 * フォーム入力欄の共通スタイル
 */

// REQ-209 FR-209-02: モーダル/フォームの大きめ入力欄クラス。
// 構造（w-full border-2 rounded-xl ... / 基本配色）は全フォーム共通だが、フォーカス枠色だけ
// テーマで異なる（既定=ブランド赤 / SurveyRequestForm はフォーム全体の amber テーマに合わせ amber）。
// 以前は AuthModal・AuthCallbackPage・SurveyRequestForm で同一構造の文字列をインライン再掲していた。
// accent 引数で focus 枠色のみ切り替え、構造の重複を 1 箇所へ集約する（赤系の出力は従来と不変）。
type FormInputAccent = 'red' | 'amber'

// REQ-223 FR-223-01: iOS Safari は入力欄のフォントが 16px 未満だとフォーカス時に自動ズームする。
// 入力欄は text-base（16px）を基準にし、デスクトップ（md 以上）でのみ text-sm（14px）へ縮小する。
// ラベル・補助テキスト・カウンターのサイズは呼び出し側の text-sm/text-xs のままで変えない（入力欄のみ 16px 化）。
const INPUT_FONT = 'text-base md:text-sm'

// PostForm 用（モーダル内の大きめフォーム）
export function formInputCls(dark: boolean, accent: FormInputAccent = 'red'): string {
  const focus = accent === 'amber'
    ? (dark ? 'focus:border-amber-500' : 'focus:border-amber-400')
    : (dark ? 'focus:border-red-500' : 'focus:border-red-400')
  // REQ-322 FR-322-04: プレースホルダ色を `::placeholder` の指定として明示する。
  // dark の slate-600 は slate-800 地で 1.93:1、light は指定が無くブラウザ既定（Chrome は
  // 概ね #757575 相当だが端末依存）に委ねていた。検索欄（FilterBar）と同じ値へ揃える。
  return `w-full border-2 rounded-xl px-3 py-2.5 ${INPUT_FONT} focus:outline-hidden transition-colors ${
    dark
      ? `bg-slate-800 border-slate-600/80 text-slate-200 ${focus} placeholder-slate-400`
      : `border-gray-200 text-gray-800 ${focus} placeholder-gray-500`
  }`
}

// EditDialog 用（コンパクトなダイアログ）
export function dialogInputCls(dark: boolean): string {
  return `w-full border rounded-lg px-3 py-2 ${INPUT_FONT} focus:outline-hidden focus:ring-2 focus:ring-red-400 transition-colors ${
    dark ? 'bg-slate-700 border-slate-600 text-slate-200 placeholder-slate-400' : 'border-gray-200 text-gray-700 placeholder-gray-500'
  }`
}

/**
 * REQ-163: モーダル/フォームのアクションボタン共通スタイル規約。
 * 色・角丸（rounded-xl に統一）・フォーカスリング・disabled 状態のみを提供する。
 * 幅(flex-1 / w-full)・padding・font-size はレイアウトに応じて呼び出し側で付与する。
 *
 *  - primary    : 建設的な主要アクション（ログイン/登録/投稿/保存）→ ブランド赤の単色
 *  - destructive: 破壊的アクション（削除/通報）→ ソリッド赤
 *  - secondary  : 副次アクション（キャンセル）→ 枠線
 */
const BTN_SHARED =
  'rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed focus:outline-hidden focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1'

// REQ-224 FR-224-04: アクセント（10%）は主 CTA 専用の 1 色（--color-accent）に限定。
// 種色（SPECIES.color）・状態色（--color-error 等）とは用途を分け、ここだけが accent を使う。
//
// REQ-322 FR-322-03: グラデ（from-accent → to-accent-to = #e11d48）を廃し**単色**にする。
// LP の主 CTA はベタ #DC2626、こちらはグラデで下端が rose-600 という状態で、
// 同じ「押せる赤」が 2 種類の意匠になっていた（Round 3 採点 #7）。
// 主ボタンの見た目はこの 1 定数が正本なので、呼び出し側で `bg-linear-to-r ...` を手打ちしない。
export const btnPrimaryCls =
  `${BTN_SHARED} text-white bg-accent hover:bg-(--color-accent-hover) shadow-md shadow-red-500/20 active:scale-[0.98]`

export const btnDestructiveCls =
  `${BTN_SHARED} text-white bg-red-600 hover:bg-red-700`

export function btnSecondaryCls(dark: boolean): string {
  return `${BTN_SHARED} border-2 ${
    dark ? 'border-slate-600 text-slate-300 hover:bg-slate-700' : 'border-gray-200 text-gray-700 hover:bg-gray-50'
  }`
}

/**
 * REQ-224: エラー UI の「再試行」ボタン共通スタイル。
 * これまで CommentSection / RankingPage(LoadErrorState) / ProfilePage / DetailPage が
 * 同型の neutral（gray/slate）ボタンをインライン再掲しており、色・hover・フォーカスリングが
 * 微妙に不揃いだった。色・hover・focus-visible リングのみをここへ集約し、見た目は据え置く。
 *
 * NOTE: font-size / padding / 角丸（rounded-lg|xl）・幅はレイアウト都合で差があるため呼び出し側で付与する。
 *       （BTN_SHARED は rounded-xl を内包し呼び出し側の rounded-lg と衝突するためここでは使わない。）
 *       色のコントラストは neutral トークン上で 4.5:1 以上（gray-100/gray-700・slate-800/slate-200）を維持。
 */
export function btnRetryCls(dark: boolean): string {
  // REQ-323 FR-323-07: 390px 実測 74×37px でタップ域 44px 未満だった（AC-05 は再試行のような
  // エラー時のボタンも例外にしない）。呼び出し側の px-*/py-* に依存せず、この 1 箇所で 44px を保証する。
  return `inline-flex items-center justify-center min-h-11 min-w-11 font-semibold transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1 ${
    dark ? 'bg-slate-800 hover:bg-slate-700 text-slate-200' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
  }`
}
