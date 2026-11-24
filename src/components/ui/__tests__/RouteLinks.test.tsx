import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import RouteLinks from '../RouteLinks'

const translations: Record<string, string> = {
  'route.title': 'ここへの経路',
  'route.approximate': 'おおよその位置',
  'route.destinationLabel': '目的地',
  'route.openAria': '{{provider}}で経路を調べる（新しいタブで開く）',
  'route.provider.google': 'Googleマップ',
  'route.provider.yahoo': 'Yahoo!マップ',
  'route.provider.apple': 'Appleマップ',
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, string>) => {
      const val = translations[key] ?? key
      return opts ? val.replace(/\{\{(\w+)\}\}/g, (_: string, k: string) => opts[k] ?? '') : val
    },
  }),
}))

describe('RouteLinks (REQ-329)', () => {
  it('Google / Yahoo! / Apple の 3 つのリンクを新しいタブで開く', () => {
    render(<RouteLinks lat={39.7186} lng={140.1023} />)
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(3)
    for (const a of links) {
      expect(a).toHaveAttribute('target', '_blank')
      expect(a).toHaveAttribute('rel', 'noopener noreferrer')
    }
    expect(screen.getByRole('link', { name: 'Googleマップで経路を調べる（新しいタブで開く）' }))
      .toHaveAttribute('href', expect.stringContaining('https://www.google.com/maps/dir/'))
    expect(screen.getByRole('link', { name: 'Yahoo!マップで経路を調べる（新しいタブで開く）' }))
      .toHaveAttribute('href', expect.stringContaining('https://map.yahoo.co.jp/route/car'))
    expect(screen.getByRole('link', { name: 'Appleマップで経路を調べる（新しいタブで開く）' }))
      .toHaveAttribute('href', expect.stringContaining('https://maps.apple.com/directions'))
  })

  it('粗化した位置では「おおよその位置」と添える', () => {
    render(<RouteLinks lat={39.7} lng={140.1} approximate />)
    expect(screen.getByText(/おおよその位置/)).toBeInTheDocument()
  })

  it('座標が無い（位置非公開）ときは何も描かない', () => {
    const { container } = render(<RouteLinks lat={Number.NaN} lng={Number.NaN} />)
    expect(container).toBeEmptyDOMElement()
  })
})
