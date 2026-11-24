import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright-core'

// CIのplaceholder環境だけで表示ずれを採取する。本文・URL・認証情報は保存しない。
const origin = 'http://127.0.0.1:3112'
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', '3112'], { stdio: 'ignore' })
let browser
try {
  let ready = false
  for (let attempt = 0; attempt < 40; attempt++) {
    try { ready = (await fetch(`${origin}/about`)).ok } catch { /* 起動待ち */ }
    if (ready) break
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  if (!ready) throw new Error('Layout diagnostic server did not start')
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] })
  const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1350, height: 940 }, serviceWorkers: 'block' })
  await context.route('**/*', route => new URL(route.request().url()).origin === origin
    ? route.continue() : route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  const page = await context.newPage()
  await page.addInitScript(() => {
    window.__layoutShifts = []
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        if (entry.hadRecentInput) continue
        window.__layoutShifts.push({ value: entry.value, time: entry.startTime, language: document.documentElement.lang,
          sources: entry.sources.map(source => ({
            tag: source.node?.nodeName, classes: source.node?.className?.baseVal ?? source.node?.className,
            before: source.previousRect.toJSON(), after: source.currentRect.toJSON(),
          })) })
      }
    }).observe({ type: 'layout-shift', buffered: true })
  })
  await page.goto(`${origin}/about`)
  await page.waitForTimeout(5000)
  const result = await page.evaluate(() => ({
    total: window.__layoutShifts.reduce((sum, shift) => sum + shift.value, 0),
    largest: window.__layoutShifts.sort((a, b) => b.value - a.value).slice(0, 5),
  }))
  await mkdir('.lighthouseci', { recursive: true })
  await writeFile('.lighthouseci/about-layout-shifts.json', JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result))
} finally {
  await browser?.close()
  server.kill('SIGTERM')
}
