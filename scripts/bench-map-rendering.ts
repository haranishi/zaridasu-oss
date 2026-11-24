import { parseArgs } from 'node:util'
import { chromium } from '@playwright/test'
import { prepareMapPosts, syntheticMapPosts } from '../tests/e2e/fixtures/map-posts'

// 同じNode/lockfileで作った変更前後の本番サーバーを指定する。外部サービスには接続しない。
const { values } = parseArgs({ options: {
  before: { type: 'string', default: 'http://127.0.0.1:3111' },
  after: { type: 'string', default: 'http://127.0.0.1:3112' },
} })
for (const origin of [values.before!, values.after!]) {
  if (!['127.0.0.1', 'localhost'].includes(new URL(origin).hostname)) throw new Error('Use local benchmark servers')
}
const browser = await chromium.launch()
const cases = []
try {
  for (const { name, origin } of [{ name: 'before', origin: values.before! }, { name: 'after', origin: values.after! }]) {
    for (const count of [50, 2000]) {
      const measurements = []
      for (let round = 0; round < 3; round++) {
        const context = await browser.newContext({ viewport: { width: 1350, height: 940 }, locale: 'ja-JP', serviceWorkers: 'block' })
        try {
          const page = await context.newPage()
          const cdp = await context.newCDPSession(page)
          await cdp.send('Performance.enable')
          const fixture = await prepareMapPosts(page, syntheticMapPosts(count), origin)
          let start = (await cdp.send('Performance.getMetrics')).metrics
          await page.goto(origin)
          await page.locator('.zari-map-main .leaflet-marker-icon').first().waitFor()
          if (count === 2000) {
            await page.waitForTimeout(800)
            start = (await cdp.send('Performance.getMetrics')).metrics
            const response = page.waitForResponse(response => new URL(response.url()).pathname === '/rest/v1/posts' && new URL(response.url()).searchParams.get('limit') === '2000')
            await page.getByRole('button', { name: '現在の地図範囲内のみ', exact: true }).click()
            if ((await (await response).json()).length !== 2000) throw new Error('Fixture did not return 2000 posts')
          }
          // 同じ時間窓でCDPのmain-thread CPUを比較する。待機時間自体はCPU時間に含まれない。
          await page.waitForTimeout(1600)
          const end = (await cdp.send('Performance.getMetrics')).metrics
          const metric = (metrics: typeof end, name: string) => {
            const value = metrics.find(item => item.name === name)?.value
            if (value === undefined) throw new Error(`Missing CDP metric: ${name}`)
            return value
          }
          const cpuMs = Object.fromEntries(['TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration']
            .map(name => [name, 1000 * (metric(end, name) - metric(start, name))]))
          await cdp.send('HeapProfiler.collectGarbage')
          const dom = await cdp.send('Memory.getDOMCounters')
          const heap = await cdp.send('Runtime.getHeapUsage')
          if (fixture.unexpected.length) throw new Error('Unexpected external request was blocked')
          measurements.push({ ...dom, usedHeapBytes: heap.usedSize, cpuMs, columns: fixture.postQueries.at(-1)?.searchParams.get('select')?.split(',').length })
        } finally { await context.close() }
      }
      cases.push({ name, count, measurements })
    }
  }
  console.log(JSON.stringify({ browser: browser.version(), viewport: [1350, 940], fixture: 'synthetic public posts, all popups closed', gc: 'HeapProfiler.collectGarbage', cases }, null, 2))
} finally { await browser.close() }
