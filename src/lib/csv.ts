// CSV の 1 セルを安全に書き出す共通関数（REQ-244 FR-244-03 を公開データセットの route から切り出した）。
//
// 1) 数式先頭文字（= + - @ / TAB / CR）で始まる値は先頭に `'` を付けて、表計算ソフトの数式評価を無効化する。
//    利用者が入力した自由文字列（コメント・スポット名など）を研究者や自治体が Excel で開いても安全にするため。
// 2) その後で区切り文字（カンマ・引用符・改行）を含む値を二重引用符で囲う。

const CSV_FORMULA_TRIGGERS = new Set(['=', '+', '-', '@', '\t', '\r'])

export function csvCell(value: string | number | null | undefined): string {
  if (value == null) return ''
  let s = String(value)
  // charAt(0) は空文字列で '' を返す（トリガー集合に無い）ため長さチェック不要・undefined も出ない。
  if (CSV_FORMULA_TRIGGERS.has(s.charAt(0))) {
    s = `'${s}`
  }
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
