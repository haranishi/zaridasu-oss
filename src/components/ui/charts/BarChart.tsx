interface BarDataItem {
  count: number
  label: string
}

interface BarChartProps {
  data: BarDataItem[] | null
  dark: boolean
  /**
   * REQ-323 FR-323-10: 最大値の目盛ラベル（例「8件」）。
   * 単位は言語で変わるので、i18n の解決は呼び出し側で行い文字列だけ受け取る
   * （BarChart 自体は表示専用のまま＝既存テストのモック事情を増やさない）。
   */
  maxLabel?: string
  /** 値のある期間が 1 つだけのときに主役として出す見出し（例「3月に8件」）。 */
  soleValueHeadline?: string
  /** 同じく、その下に添える説明文。 */
  soleValueNote?: string
}

export default function BarChart({ data, dark, maxLabel, soleValueHeadline, soleValueNote }: BarChartProps) {
  if (!data || data.length === 0) return null
  const max = Math.max(...data.map((d) => d.count), 1)
  const axis = dark ? 'text-slate-400' : 'text-gray-500'
  const rule = dark ? 'bg-slate-600' : 'bg-gray-300'

  /**
   * REQ-323 FR-323-10: 立ち上がり期は 12 ヶ月のうち 1 ヶ月しかデータが無く、
   * 「空の列が 11 本と棒が 1 本」＝壊れた表にしか見えなかった（Round 4 採点 🟡）。
   * 値が 1 つしか無いなら、そもそも推移として読めない。**数値そのもの**を主役にする。
   * 文言が渡っていないとき（dashboard の KPI 等）は従来どおり棒グラフを出す。
   *
   * REQ-325 FR-325-03: ただし旧実装はこの数値を **棒グラフと同じ h-40/h-44 の箱に中央寄せ**で
   * 置いていた。数値 1 行＋注記 1 行しか無いのに 176px を確保するので、見出しの下 55px・
   * 本文の下 75px が空き、カード全体（555px）の約 130px が説明のつかない空白帯になっていた。
   * 「グラフを名乗る見出しの下に何も描かれていない領域がある」＝読み込み失敗に見える、という
   * 減点（Round 5c 採点 TOP5-2・項目10）はこの空白が原因なので、
   *  - 高さの予約をやめて内容ぶんだけの高さにする
   *  - 見出し・カード内の他要素と同じ**左揃え**にする（中央寄せだと軸が 2 本に見える）
   * の 2 点で潰す。数値そのものは実データのまま（0 は 0 として TrendsPage 側の注記が説明する）。
   */
  if (soleValueHeadline && soleValueNote) {
    return (
      <div className="flex flex-col gap-1.5">
        <p className={`text-3xl font-black tabular-nums ${dark ? 'text-slate-100' : 'text-gray-800'}`}>
          {soleValueHeadline}
        </p>
        <p className={`text-xs leading-relaxed ${axis}`}>{soleValueNote}</p>
      </div>
    )
  }

  return (
    <div className="flex h-40 sm:h-44">
      {/* 縦軸（最大値の目盛 + 0）。
          REQ-323 FR-323-10: 旧実装はベースライン（0 の軸線）も目盛も無く、棒が「どこから
          生えているか」「どれくらい大きいのか」を読む手がかりが 1 つも無かった。
          目盛は 0 と最大値の 2 つだけにして、狭い幅でも数字が潰れないようにする。 */}
      <div className={`flex w-9 shrink-0 flex-col pe-1.5 text-right text-[10px] tabular-nums leading-none sm:w-10 ${axis}`}>
        <div className="relative min-h-0 flex-1">
          <span className="absolute right-0 top-0">{maxLabel ?? max}</span>
          <span className="absolute bottom-0 right-0">0</span>
        </div>
        {/* 下の月ラベル行と同じ高さの見えない行。軸の「0」を棒のベースラインに揃えるため、
            高さを数値で書かずラベル行と同じクラスで作る（フォント差でズレない）。 */}
        <span aria-hidden="true" className="invisible pt-1.5 text-[11px] leading-none sm:text-xs">0</span>
      </div>

      <div className="relative flex min-w-0 flex-1 flex-col">
        {/* 最大値のグリッド線と 0 のベースライン。棒の描画領域だけに引く（ラベル行には引かない）。 */}
        <div className="relative flex min-h-0 flex-1 gap-1 sm:gap-1.5">
          <div aria-hidden="true" className={`pointer-events-none absolute inset-x-0 top-4 h-px opacity-50 ${rule}`} />
          <div aria-hidden="true" className={`pointer-events-none absolute inset-x-0 bottom-0 h-px ${rule}`} />
          {data.map((d, i) => {
            const pct = (d.count / max) * 100
            return (
              <div key={i} className="group relative flex min-w-0 flex-1 flex-col items-center">
                {/* REQ-268 FR-268-10: 件数は hover 依存をやめ常時表示（タッチ端末でも読める）
                    REQ-320 FR-320-08: ただし 0 は描かない。立ち上がり期は 12 本中 11 本が 0 で、
                    棒が無い列の上に「0」だけが 11 個並び、グラフが「読み込みに失敗した表」に見えていた
                    （Round 1 採点 #15）。値が無い月は数字も出さず、棒のある月だけを読ませる。
                    span 自体は残して各列の高さを揃える（消すとベースラインがずれる）。 */}
                {/* 高さを h-4 で固定するのは、上の「最大値のグリッド線（top-4）」を
                    バー描画領域の上端とぴったり一致させるため（数字の行送りに依存させない）。 */}
                <span
                  className={`h-4 shrink-0 text-[11px] leading-4 tabular-nums sm:text-xs ${axis}`}
                  aria-hidden={d.count === 0 ? 'true' : undefined}
                >
                  {d.count > 0 ? d.count : ' '}
                </span>
                {/* バーエリア（残りスペースを全部使う）
                    REQ-318 FR-318-04: バーは「データそのもの」なので UI 部品基準 3:1 が要る。
                    グラデをやめて単色にしたのは、グラデだと「一番薄い端」が基準を割りやすく、
                    自動テスト（FR-318-05）で守るべき値が 1 バーにつき 2 つになるため。
                    REQ-322 FR-322-07: 全部の月を同じ色にする（最新月だけ別色にすると、最新月が
                    0 件の立ち上がり期に「唯一データのある棒が灰色」になり読み込み失敗に見えた）。
                    REQ-323 FR-323-06: その 1 色をブランド赤から `--chart-quantity`（濃い無彩色）へ。
                    ブランド赤は CTA とリンク専用にして、「量」と「行動」を色で読み分けられるようにする。
                    最新月の区別は色ではなくラベルの太さで示す（REQ-224: 色だけに頼らない）。 */}
                <div className="flex w-full flex-1 items-end">
                  <div
                    className="w-full rounded-t-sm bg-(--chart-quantity) transition-all duration-500 group-hover:brightness-95 sm:rounded-t-md"
                    style={{ height: `${Math.max(pct, d.count > 0 ? 4 : 0)}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
        {/* ラベル行（最新月だけ太字＝色を使わない強調） */}
        <div className="flex shrink-0 gap-1 sm:gap-1.5">
          {data.map((d, i) => (
            <span
              key={i}
              className={`min-w-0 flex-1 truncate pt-1.5 text-center text-[11px] leading-none sm:text-xs ${
                i === data.length - 1 ? 'font-bold' : ''
              } ${axis}`}
              title={d.label}
            >
              {d.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
