import { defineConfig, devices } from '@playwright/test'

const E2E_PORT = Number(process.env.E2E_PORT ?? 3100)
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${E2E_PORT}`

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  maxFailures: process.env.CI ? 5 : undefined,
  forbidOnly: !!process.env.CI,
  // REQ-110 FR-110-07: CI 上のフレーク対策として 1 回リトライを許可
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        // SSR/Proxy fetch cannot be intercepted with page.route. This test-only import
        // recognizes fixed fake tokens only on placeholder.supabase.co; never load it for build/deploy.
        command: `npm run build && node --import ./tests/e2e/fixtures/admin-auth-transport.mjs ./node_modules/next/dist/bin/next start -H 127.0.0.1 -p ${E2E_PORT}`,
        url: baseURL,
        reuseExistingServer: false,
        // REQ-297: この timeout は「サーバ起動待ち」ではなく **本番ビルド1回ぶんの時間** を含む
        // （command が `npm run build && npm run start`）。300_000 では足りず、2026-07-31 の
        // CI で `Timed out waiting 300000ms from config.webServer.` が発生した。実測では
        // build 開始から起動直前までが 5分2秒 で、旧値のちょうど境界に乗っていた。
        // GitHub Actions の共有 runner は速度が一定しないため、境界ギリギリの値は flaky に
        // なる。e2e ジョブ自体の timeout-minutes: 30 に収まる範囲で余裕を取る。
        timeout: 600_000,
        env: {
          NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
          NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder',
        },
      },
})
