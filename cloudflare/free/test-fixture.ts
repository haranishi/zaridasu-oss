// Test-only entry. The production profile never imports or bundles this module.
import { RenderHandler as ActualRenderHandler, DOQueueHandler } from '../free.renderer'
import type { FreeRendererEnv } from './env'
import { restoreHopRequest } from './hop.mjs'

function faultBinding(database: D1Database, control: Fetcher): D1Database {
  function wrap<T extends object>(target: T): T {
    return new Proxy(target, { get(object, name) {
      const value: unknown = Reflect.get(object, name, object)
      if (typeof value !== 'function') return value
      return (...args: unknown[]) => {
        const operation = ['first', 'all', 'raw'].includes(String(name)) ? 'read'
          : ['run', 'exec', 'batch'].includes(String(name)) ? 'write' : null
        if (operation) return (async () => {
          const fault = await control.fetch(`https://test-control.invalid/${operation}`)
          if (fault.status === 429) throw new Error('injected-native-D1-quota-private-marker')
          return Reflect.apply(value, object, args)
        })()
        const result = Reflect.apply(value, object, args)
        return result && typeof result === 'object' && (result.prepare || result.bind || result.run) ? wrap(result) : result
      }
    } })
  }
  return wrap(database)
}

class RenderHandler extends ActualRenderHandler {
  private readonly nativeDatabase: D1Database
  private readonly nativeMethods: [keyof D1Database, unknown][]
  private readonly control: Fetcher
  constructor(state: DurableObjectState, env: FreeRendererEnv & { FREE_TEST_CONTROL: Fetcher }) {
    super(state, { ...env, NEXT_INC_CACHE_D1: faultBinding(env.NEXT_INC_CACHE_D1, env.FREE_TEST_CONTROL) })
    this.nativeDatabase = env.NEXT_INC_CACHE_D1
    this.nativeMethods = (['prepare', 'batch', 'exec', 'withSession'] as const).map(name => [name, env.NEXT_INC_CACHE_D1[name]])
    this.control = env.FREE_TEST_CONTROL
  }
  async fetch(input: Request): Promise<Response> {
    if (!new URL(input.url).pathname.startsWith('/__free_probe')) {
      try { return await super.fetch(input) } finally {
        await this.control.fetch('https://test-control.invalid/integrity', { method: 'POST',
          body: JSON.stringify({ unchanged: this.nativeMethods.every(([name, method]) => this.nativeDatabase[name] === method) }) })
      }
    }
    const request = restoreHopRequest(input, this.env.PREVIEW_FORWARD_SECRET)
    if (!request) return new Response('Private probe denied', { status: 403 })
    const headers = new Headers({ 'content-type': 'application/json', location: '/retained' })
    headers.append('set-cookie', 'probeA=a; Secure; HttpOnly; Path=/')
    headers.append('set-cookie', 'probeB=b; Secure; HttpOnly; Path=/')
    return new Response(JSON.stringify({ url: request.url, method: request.method, headers: Object.fromEntries(request.headers),
      body: await request.text() }), { status: 302, headers })
  }
}
export { RenderHandler, DOQueueHandler }
export { default } from '../free.renderer'
