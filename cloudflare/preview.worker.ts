import type { PreviewEnv } from './preview/app-env'
import './preview/egress'
import appWorker from './worker'
import { createChunks } from '@supabase/ssr'
import { previewGate, protectResponse, isBackendPath, readBoundedBody, replaceSessionCookies } from './preview/security.mjs'
import { revalidationToken } from '../.wrangler/preview-profile/revalidation-token.mjs'

// Keep the actual generated Durable Object implementation and its build-specific signing token.
export { DOQueueHandler } from '../.open-next/worker.js'

const handler = {
  async fetch(request, env, ctx): Promise<Response> {
    const gate = await previewGate(request, env, revalidationToken)
    if (gate) return gate
    const url = new URL(request.url)
    let response: Response
    if (url.pathname === '/__preview/identity') {
      if (request.method !== 'POST' || request.headers.get('origin') !== env.PREVIEW_APP_ORIGIN) {
        return protectResponse(new Response('Origin or method denied', { status: 403 }))
      }
      let body: string
      try { body = await readBoundedBody(request) } catch { return protectResponse(new Response('Request too large', { status: 413 })) }
      response = await env.PREVIEW_BACKEND.fetch(new Request(`${env.PREVIEW_APP_ORIGIN}/__fixture/session`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body,
      }))
      if (!response.ok) return protectResponse(response)
      const session = await response.json<{ user: { id: string } }>()
      const cookieName = `sb-${url.hostname.split('.')[0]}-auth-token`
      const cookieHeaders = new Headers({ 'content-type': 'application/json' })
      replaceSessionCookies(cookieHeaders, request.headers.get('cookie'), cookieName,
        createChunks(cookieName, `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`))
      return protectResponse(new Response(JSON.stringify({ synthetic: true, userId: session.user.id }), { headers: cookieHeaders }))
    }
    if (url.pathname.startsWith('/__fixture')) response = new Response('Not found', { status: 404 })
    else if (isBackendPath(url.pathname)) response = await env.PREVIEW_BACKEND.fetch(request)
    else {
      const asset = ['GET', 'HEAD'].includes(request.method) ? await env.ASSETS.fetch(request) : undefined
      response = asset && asset.status !== 404 ? asset : await appWorker.fetch(request, env, ctx)
    }
    return protectResponse(response)
  },
} satisfies ExportedHandler<PreviewEnv>

export default handler
