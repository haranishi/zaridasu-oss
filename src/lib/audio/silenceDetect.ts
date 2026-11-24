// REQ-077 FR-077-01: 音声の RMS 計算 + 無音判定。
// decodeAudioData が失敗した場合は null を返し、呼び出し側はゲートをスキップする。

export interface SilenceCheckResult {
  isSilent: boolean
  rmsDbFs: number
}

const DEFAULT_THRESHOLD_DBFS = Number(
  process.env.NEXT_PUBLIC_AI_SILENCE_THRESHOLD_DBFS ?? '-45',
)

export async function checkSilence(
  blob: Blob,
  thresholdDbFs: number = DEFAULT_THRESHOLD_DBFS,
): Promise<SilenceCheckResult | null> {
  if (typeof window === 'undefined') return null
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioCtx) return null

  let ctx: AudioContext | null = null
  try {
    ctx = new AudioCtx()
    const buffer = await ctx.decodeAudioData(await blob.arrayBuffer())
    const data = buffer.getChannelData(0)
    let sumSquares = 0
    for (let i = 0; i < data.length; i++) {
      const v = data[i]!
      sumSquares += v * v
    }
    const rms = Math.sqrt(sumSquares / data.length) || 1e-12
    const rmsDbFs = 20 * Math.log10(rms)
    return { isSilent: rmsDbFs < thresholdDbFs, rmsDbFs }
  } catch {
    return null
  } finally {
    try {
      await ctx?.close()
    } catch {
      /* noop */
    }
  }
}
