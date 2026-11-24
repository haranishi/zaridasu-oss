import { createHmac, randomBytes } from 'node:crypto'
import { equalSecret } from '../preview/security.mjs'

const PAYLOAD = 'x-zaridasu-forward'
const SIGNATURE = 'x-zaridasu-forward-signature'
const mac = (value, secret) => createHmac('sha256', secret).update(value).digest('base64url')

function cleanHeaders(request, ip) {
  const headers = new Headers(request.headers)
  for (const name of [...headers.keys()]) {
    if (name.startsWith('x-zaridasu-') || name.startsWith('x-vercel-')
      || ['forwarded', 'x-forwarded-for', 'x-real-ip', 'cf-connecting-ip', 'cf-worker'].includes(name)) headers.delete(name)
  }
  if (ip !== null) headers.set('cf-connecting-ip', ip)
  return headers
}

/** The public edge's CF header is authenticated across the private namespace hop. */
export function signHopRequest(request, secret, seconds = Math.floor(Date.now() / 1000)) {
  if (typeof secret !== 'string' || secret.length < 32) throw new Error('Private forwarding unavailable')
  const source = request.headers.get('cf-connecting-ip')
  const ip = source !== null && source.length <= 256 ? source : null
  const payload = Buffer.from(JSON.stringify([request.url, request.method, ip, seconds,
    randomBytes(16).toString('base64url')])).toString('base64url')
  const headers = cleanHeaders(request, null)
  headers.set(PAYLOAD, payload)
  headers.set(SIGNATURE, mac(payload, secret))
  return new Request(request, { headers, redirect: 'manual' })
}

/** Ignore every hop-supplied identity header; restore only the signed original CF header. */
export function restoreHopRequest(request, secret, seconds = Math.floor(Date.now() / 1000)) {
  if (typeof secret !== 'string' || secret.length < 32) return null
  const payload = request.headers.get(PAYLOAD)
  if (!payload || payload.length > 8192 || !equalSecret(request.headers.get(SIGNATURE), mac(payload, secret))) return null
  try {
    const [url, method, ip, issued, nonce] = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (url !== request.url || method !== request.method || !Number.isSafeInteger(issued)
      || Math.abs(seconds - issued) > 30 || !/^[A-Za-z0-9_-]{22}$/.test(nonce)
      || (ip !== null && (typeof ip !== 'string' || ip.length > 256))) return null
    return new Request(request, { headers: cleanHeaders(request, ip), redirect: 'manual' })
  } catch { return null }
}
