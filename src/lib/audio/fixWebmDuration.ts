// REQ-082: Chrome MediaRecorder の webm blob には duration metadata が含まれない
// (Chromium issue 642012, WontFix) ため、保存前に EBML を解析して Duration 要素を埋め込む。
// fail-soft: ライブラリが失敗した場合は元 blob をそのまま返し、投稿フローを止めない。
//
// REQ-144: AudioRecorder の chunk から `fix-webm-duration` を取り除くため、
// 静的 import を `await import()` の動的ロードに切り替える。録音停止時にしか
// 呼び出されないため、追加 RTT は数十 ms オーダーで実害なし。

export async function patchWebmDuration(
  blob: Blob,
  mime: string,
  durationMs: number,
): Promise<Blob> {
  // webm 以外（mp4 / mp3 / ogg）は対象外
  if (!mime.startsWith('audio/webm')) return blob
  if (!Number.isFinite(durationMs) || durationMs <= 0) return blob
  try {
    const { default: fixWebmDuration } = await import('fix-webm-duration')
    return await fixWebmDuration(blob, durationMs, { logger: false })
  } catch {
    return blob
  }
}
