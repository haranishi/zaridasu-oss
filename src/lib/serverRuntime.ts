/** Deployment configuration, never a request header, selects the trusted edge. */
export function isCloudflareRuntime(): boolean {
  return process.env.ZARIDASU_RUNTIME === 'cloudflare'
}

/** Auth responses, including redirects and rate-limit denials, are never shared. */
export function privateNoStore<T extends Response>(response: T, varyCookie = false): T {
  response.headers.set('Cache-Control', 'private, no-cache, no-store, must-revalidate, max-age=0')
  response.headers.set('Expires', '0')
  response.headers.set('Pragma', 'no-cache')
  const vary = response.headers.get('Vary')
  // Pass-through responses leave Vary to Next; no-store already forbids reuse.
  // A Proxy Vary value would override the downstream framework variants in OpenNext.
  if (varyCookie && !vary?.split(',').some(value => ['cookie', '*'].includes(value.trim().toLowerCase()))) {
    response.headers.set('Vary', vary ? `${vary}, Cookie` : 'Cookie')
  }
  return response
}
