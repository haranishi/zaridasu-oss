import { assertContentLengthWithinLimit, MediaTooLargeError } from './aiSchema.ts'

export class UntrustedMediaUrlError extends Error {
  constructor() {
    super('Untrusted media URL')
    this.name = 'UntrustedMediaUrlError'
  }
}

export function assertTrustedMediaUrl(rawUrl: string, opts?: {
  supabaseUrl?: string; allowedHosts?: string
}): URL {
  try {
    const base = new URL(opts?.supabaseUrl ?? Deno.env.get('SUPABASE_URL') ?? '')
    const url = new URL(rawUrl)
    const allowed = (opts?.allowedHosts ?? Deno.env.get('AI_MEDIA_ALLOWED_HOSTS') ?? '')
      .split(',').map(h => h.trim().toLowerCase()).filter(Boolean)
    if (url.username || url.password) throw new UntrustedMediaUrlError()
    if (url.protocol !== 'https:' && !(base.protocol === 'http:' &&
      url.protocol === 'http:' && url.host === base.host)) throw new UntrustedMediaUrlError()
    if (url.hostname !== base.hostname && !allowed.includes(url.hostname.toLowerCase())) {
      throw new UntrustedMediaUrlError()
    }
    if (url.port && !(url.hostname === base.hostname && url.port === base.port)) {
      throw new UntrustedMediaUrlError()
    }
    // 正規化で消える traversal と、二重エンコード・区切り文字の迂回も拒否する。
    const rawPath = rawUrl.replace(/^[a-z]+:\/\/[^/]+/i, '').split(/[?#]/)[0]
    if (rawPath.split('/').some(p => p === '.' || p === '..') ||
      /%2e|%2f|%5c|%25|\\/i.test(rawPath)) throw new UntrustedMediaUrlError()
    if (!['/storage/v1/object/public/', '/storage/v1/render/image/public/']
      .some(prefix => url.pathname.startsWith(prefix))) throw new UntrustedMediaUrlError()
    return url
  } catch {
    throw new UntrustedMediaUrlError()
  }
}

export async function readBodyWithLimit(res: Response, maxBytes: number, kind: 'image' | 'audio'): Promise<Uint8Array> {
  try {
    assertContentLengthWithinLimit(res, kind, maxBytes)
  } catch (e) {
    await res.body?.cancel().catch(() => {})
    throw e
  }
  if (!res.body) return new Uint8Array()
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) {
        await reader.cancel().catch(() => {})
        throw new MediaTooLargeError(kind, size, maxBytes)
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  return bytes
}

export type Media = { bytes: Uint8Array; contentType: string }

export async function fetchTrustedMedia(url: string, opts: {
  kind: 'image' | 'audio'; maxBytes: number; timeoutMs: number; fetchImpl?: typeof fetch
}): Promise<Media> {
  const trusted = assertTrustedMediaUrl(url)
  const res = await (opts.fetchImpl ?? fetch)(trusted.toString(), {
    redirect: 'error', signal: AbortSignal.timeout(opts.timeoutMs),
  })
  if (!res.ok) {
    await res.body?.cancel().catch(() => {})
    throw new Error(`${opts.kind === 'image' ? '画像の取得に失敗しました' : 'audio fetch failed'} (${res.status})`)
  }
  return {
    bytes: await readBodyWithLimit(res, opts.maxBytes, opts.kind),
    contentType: res.headers.get('content-type') ?? '',
  }
}

export async function mediaSha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes))
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
}
