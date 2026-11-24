/**
 * ダークモード対応の共通Tailwindクラスヘルパー
 * dark ? '...' : '...' の三項演算子を各コンポーネントに書き散らさないために使う
 *
 * REQ-224: コントラスト底上げ。色・サーフェスはデザイントークン
 * （globals.css の CSS カスタムプロパティ）を Tailwind の arbitrary-value で参照し、
 * これらのヘルパーを使う既存箇所がトークン調整で自動的に改善されるようにする。
 * - faint() を旧 text-gray-400(≈2.8:1) から --color-text-faint(≈4.6:1) へ底上げ（FR-224-07 / AC-08）
 * - muted/heading/divider/pill もトークン参照に寄せ、ダーク/ライトを変数解決に一本化（NFR-224-01: ランタイムコストゼロ）
 */

export interface CardOptions {
  padding?: string
}

// dark 引数は後方互換のため残すが、色はトークンが .dark で自動解決するため分岐不要。
export const pageBg = (_dark?: boolean): string => 'bg-(--color-bg)'

export const cardCls = (_dark?: boolean, { padding = 'p-5' }: CardOptions = {}): string =>
  `rounded-2xl shadow-xs ${padding} bg-surface border border-(--color-border)`

export const heading = (_dark?: boolean): string => 'text-(--color-heading)'
export const subheading = (_dark?: boolean): string => 'text-(--color-heading)'
export const muted = (_dark?: boolean): string => 'text-(--color-text-muted)'

/**
 * 最弱の二次テキスト。**白 / ページ背景（--color-bg）の上でだけ使う。**
 *
 * REQ-325 FR-325-04: 色の付いた面（gray-100・red-50・--color-surface-2・--color-divider など）に
 * 載せるときは faint ではなく {@link muted} 以上にする。faint(#6b7280) は白地 4.83:1 /
 * ページ背景 4.63:1 に対し、淡い面 4.49:1・gray-100 4.39:1・red-50 4.42:1・blue-50 4.44:1 と
 * **面が少し暗くなるだけで AA(4.5:1) を割る**。しかも 4.3〜4.5 の「ほぼ合っている」値なので
 * 目視では見つからない。判定は src/lib/__tests__/contrast.test.ts の FR-325-04 が総当たりで行う。
 *
 * 例外: 装飾（aria-hidden のアイコン・線画）は非テキストなので 3:1 判定。faint のままでよい。
 */
export const faint = (_dark?: boolean): string => 'text-(--color-text-faint)'
export const divider = (_dark?: boolean): string => 'border-(--color-divider)'
export const pillCls = (_dark?: boolean): string =>
  'text-xs px-1.5 py-0.5 rounded-full bg-(--color-divider) text-(--color-text-muted)'
