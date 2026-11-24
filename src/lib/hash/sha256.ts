// REQ-079: 音声/画像の SHA-256 を hex 文字列で返す。dedup キーに利用。
// 失敗時は null（既存挙動互換: hash NULL で DB に保存）。

export async function sha256Hex(blob: Blob | File): Promise<string | null> {
  try {
    const buffer = await blob.arrayBuffer()
    const digest = await crypto.subtle.digest('SHA-256', buffer)
    const bytes = new Uint8Array(digest)
    let hex = ''
    for (let i = 0; i < bytes.length; i++) {
      hex += (bytes[i]!).toString(16).padStart(2, '0')
    }
    return hex
  } catch {
    return null
  }
}

/** 写真ごとの SHA-256（posts.image_hashes の元）。通常の送信と再送の両方がこれで計算する（REQ-331）。 */
export function sha256HexEach(blobs: readonly Blob[]): Promise<(string | null)[]> {
  return Promise.all(blobs.map((b) => sha256Hex(b)))
}
