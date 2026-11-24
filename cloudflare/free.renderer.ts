import { DurableObject } from 'cloudflare:workers'
import type { FreeRendererEnv } from './free/env'
import './preview/egress'
import appWorker from './worker'
import { restoreHopRequest } from './free/hop.mjs'
import { guardD1Binding } from './free/cache-guard.mjs'
import { RenderLifetime } from './free/render-lifetime.mjs'
import { equalSecret, protectResponse } from './preview/security.mjs'
import { revalidationToken } from '../.wrangler/free-profile/revalidation-token.mjs'

export { DOQueueHandler } from '../.open-next/worker.js'

export class RenderHandler extends DurableObject<FreeRendererEnv> {
  private readonly renderLifetime = new RenderLifetime()

  async fetch(input: Request): Promise<Response> {
    const request = restoreHopRequest(input, this.env.PREVIEW_FORWARD_SECRET)
    if (!request) return protectResponse(new Response('Private renderer denied', { status: 403 }))
    // Next batches normal and on-demand renders separately. Keep ISR re-entry
    // separate too; an untrusted x-isr/header value cannot select that scope.
    const scope = this.renderLifetime.join(equalSecret(request.headers.get('x-prerender-revalidate'), revalidationToken))
    const failure = scope.failure
    // Bind native state methods. Unsupported Worker-only context operations fail explicitly.
    const context = new Proxy(this.ctx, { get: (state, property) => {
      if (property === 'waitUntil') return (promise: Promise<unknown>) => {
        const tracked = scope.track(promise)
        state.waitUntil(tracked)
      }
      if (property === 'passThroughOnException') return () => { throw new Error('Renderer has no public origin fallback') }
      const value = Reflect.get(state, property, state)
      return typeof value === 'function' ? value.bind(state) : value
    } }) as unknown as ExecutionContext
    let response: Response | undefined
    try {
      try {
        if (!failure.failed) {
          const env = { ...this.env, NEXT_INC_CACHE_D1: guardD1Binding(this.env.NEXT_INC_CACHE_D1, failure) }
          response = await appWorker.fetch!(request, env, context)
        }
      } catch { failure.failed = true }
      // Coalesced waiters observe the owner's complete work and any swallowed
      // cache failure; the native waitUntil lifetime remains connected above.
      await scope.finish()
      if (response && !failure.failed) return response
      try { await response?.body?.cancel() } catch { /* An errored stream still exits with sanitized 503. */ }
    } finally { scope.close() }
    return protectResponse(new Response('Free preview storage unavailable', { status: 503 }))
  }
}

// Only the private namespace can execute the application; service/default fetch never renders it.
export default { fetch() { return new Response('Not found', { status: 404 }) } } satisfies ExportedHandler<FreeRendererEnv>
