import { test, expect } from '@playwright/test'

interface WebAppManifest {
  name?: string
  short_name?: string
  display?: string
  start_url?: string
  icons?: Array<{ sizes?: string; purpose?: string }>
  shortcuts?: unknown[]
}

test('REQ-293 AC-01: manifest.webmanifest がPWA必須項目を配信する', async ({ request }) => {
  const response = await request.get('/manifest.webmanifest')
  expect(response.status()).toBe(200)

  const manifest = (await response.json()) as WebAppManifest
  expect(manifest.name).toBeTruthy()
  expect(manifest.short_name).toBeTruthy()
  expect(manifest.display).toBe('standalone')
  expect(manifest.start_url).toBeTruthy()
  expect(manifest.shortcuts?.length).toBeGreaterThan(0)

  const icons = manifest.icons ?? []
  expect(icons.some((icon) => icon.sizes?.split(/\s+/).includes('192x192'))).toBe(true)
  expect(icons.some((icon) => icon.sizes?.split(/\s+/).includes('512x512'))).toBe(true)
  expect(
    icons.some((icon) => icon.purpose?.split(/\s+/).includes('maskable')),
  ).toBe(true)
})

test('REQ-293 AC-02: 配信HTMLのmanifestリンク先が正本ルートと一致し200を返す', async ({
  page,
  request,
}) => {
  const documentResponse = await page.goto('/')
  expect(documentResponse?.status()).toBe(200)

  const href = await page.locator('link[rel="manifest"]').getAttribute('href')
  expect(href).toBeTruthy()

  const manifestUrl = new URL(href!, page.url())
  expect(manifestUrl.pathname).toBe('/manifest.webmanifest')
  const manifestResponse = await request.get(manifestUrl.toString())
  expect(manifestResponse.status()).toBe(200)
})
