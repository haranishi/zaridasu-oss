import { withSentry } from '@sentry/nextjs/cloudflare'
import openNextWorker from '../.open-next/worker.js'
import { sentryWorkerOptions } from './sentry'

// The runtime value remains OpenNext's generated DO class, including its build-specific settings.
export { DOQueueHandler } from '../.open-next/worker.js'

function hasImageCredentials(requestUrl: URL): boolean {
  for (const source of requestUrl.searchParams.getAll('url')) {
    try {
      const image = new URL(source, requestUrl)
      if (image.username || image.password) return true
    } catch { /* OpenNext rejects malformed URL parameters. */ }
  }
  return false
}

const handler = {
  async fetch(request: Request, env: Pick<CloudflareEnv, 'ZARIDASU_DEPLOYMENT_ENV'>, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    let response: Response
    if (url.pathname.startsWith('/cdn-cgi/image/')) {
      // The app uses /_next/image. OpenNext's unused CDN handler bypasses remotePatterns.
      response = new Response('Not found', { status: 404 })
    } else if (/^\/_next\/image\/?$/.test(url.pathname) && hasImageCredentials(url)) {
      response = new Response('Image URL credentials are not allowed', { status: 400 })
    } else {
      response = await openNextWorker.fetch(request, env, ctx)
    }
    if (env.ZARIDASU_DEPLOYMENT_ENV === 'preview') {
      // Clone headers without consuming streaming bodies or changing Set-Cookie / framework Vary.
      const preview = new Response(response.body, response)
      preview.headers.set('X-Robots-Tag', 'noindex, nofollow')
      return preview
    }
    return response
  },
} satisfies ExportedHandler<Pick<CloudflareEnv, 'ZARIDASU_DEPLOYMENT_ENV'>>

export default withSentry(
  (env: Pick<CloudflareEnv, 'ZARIDASU_DEPLOYMENT_ENV'>) => sentryWorkerOptions(env.ZARIDASU_DEPLOYMENT_ENV,
    process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN),
  handler,
)
