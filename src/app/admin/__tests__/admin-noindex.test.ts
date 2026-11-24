/**
 * REQ-312 FR-312-06(c) / AC-07: `/admin` 配下の noindex を検査で固定する。
 *
 * `/admin` の保護は二重防御になっている。
 *
 * 1. `src/app/robots.ts` の `disallow: ['/admin/']` — **クロール制御**であって
 *    インデックス禁止の保証ではない（外部からの直リンクがあればインデックスされ得る）。
 * 2. `src/app/admin/layout.tsx` の `robots: { index: false, follow: false }` — Next.js の
 *    metadata 継承により `/admin` 配下すべてに届く**実際の noindex**。
 *
 * 2 が消えると保護は静かに片側だけになる。ここで固定しておき、削除・改変を検知する。
 */
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Metadata } from 'next'

const ADMIN_DIR = resolve(import.meta.dirname, '..')
const PROJECT_ROOT = resolve(ADMIN_DIR, '../../..')

describe('REQ-312: /admin 配下の noindex', () => {
  it('admin/layout.tsx が robots.index=false / follow=false を宣言している', async () => {
    const mod = (await import('@/app/admin/layout')) as { metadata?: Metadata }
    expect(mod.metadata?.robots).toEqual({ index: false, follow: false })
  })

  it('配下ページは robots を上書きせず親の noindex を継承する（index:true を持ち込まない）', () => {
    const pages: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === '__tests__') continue
        const full = resolve(dir, entry.name)
        if (entry.isDirectory()) walk(full)
        else if (entry.name === 'page.tsx') pages.push(relative(PROJECT_ROOT, full).split(sep).join('/'))
      }
    }
    walk(ADMIN_DIR)

    // 走査が空振りしていないこと（admin ページは 10 本前後ある）。
    expect(pages.length).toBeGreaterThan(5)

    const offenders = pages.filter((file) => /index:\s*true/.test(readFileSync(resolve(PROJECT_ROOT, file), 'utf8')))
    expect(offenders, `/admin 配下で index:true を宣言しているページ:\n${offenders.join('\n')}`).toEqual([])
  })

  it('robots.ts の /admin/ disallow が残っている（二重防御のもう一方）', () => {
    const robots = readFileSync(resolve(PROJECT_ROOT, 'src/app/robots.ts'), 'utf8')
    expect(robots).toContain("'/admin/'")
  })
})
