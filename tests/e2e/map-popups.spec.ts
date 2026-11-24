import { test, expect } from '@playwright/test'
import { prepareMapPosts } from './fixtures/map-posts'

test('必要な列だけの応答で投稿・調査依頼のポップアップと写真一覧を操作できる', async ({ page }) => {
  const fixture = await prepareMapPosts(page)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/map')
  const postMarker = page.locator('.zari-map-main .leaflet-marker-icon:has(.zari-marker-wiggle)')
  await expect(postMarker).toHaveCount(1, { timeout: 30_000 })
  const popup = page.locator('.leaflet-popup-content')
  for (let attempt = 0; attempt < 2; attempt++) {
    await postMarker.click()
    await expect(popup).toContainText('合成の公開観察 1')
    await expect(popup).toContainText('合成地区 · 💧 合成川')
    await expect(popup.getByRole('link', { name: '詳細を見る →' })).toHaveAttribute('href', '/post/00000000-0000-0000-0000-000000000001')
    await expect(popup.getByTestId('route-links')).toContainText('おおよその位置')
    await page.locator('.leaflet-popup-close-button').click()
    await expect(popup).toHaveCount(0)
  }
  const surveyMarker = page.locator('.zari-map-main .leaflet-marker-icon:has(svg circle[fill="#D97706"])')
  await surveyMarker.click()
  await expect(popup).toContainText('合成の調査依頼')
  await expect(popup.locator('a[href="/request/00000000-0000-0000-0000-000000002001"]')).toBeVisible()
  await page.locator('.leaflet-popup-close-button').click()
  await page.getByRole('button', { name: /^写真 —/ }).click()
  await expect(page.locator('a[href="/post/00000000-0000-0000-0000-000000000001"] img').last()).toBeVisible()
  expect(fixture.postQueries).toHaveLength(1)
  const columns = fixture.postQueries[0]!.searchParams.get('select')!.split(',').map(value => value.trim())
  expect(columns).toContain('lat:display_lat')
  expect(columns).toContain('lng:display_lng')
  expect(columns).not.toContain('user_id')
  expect(columns).not.toContain('geo_enriched_at')
  expect(errors).toEqual([])
  expect(fixture.unexpected).toEqual([])
})
