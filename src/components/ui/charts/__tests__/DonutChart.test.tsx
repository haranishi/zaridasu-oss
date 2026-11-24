import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import DonutChart from '../DonutChart'

describe('DonutChart', () => {
  const segments = [
    { value: 3, color: '#DC2626' },
    { value: 1, color: '#EA580C' },
  ]

  it('SVG 要素を描画する', () => {
    const { container } = render(<DonutChart segments={segments} />)
    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
  })

  it('セグメント数分の circle 要素を描画する', () => {
    const { container } = render(<DonutChart segments={segments} />)
    // 背景の circle + セグメント分
    const circles = container.querySelectorAll('circle')
    expect(circles.length).toBe(segments.length + 1)
  })

  it('デフォルトの size (90) が適用される', () => {
    const { container } = render(<DonutChart segments={segments} />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('width', '90')
    expect(svg).toHaveAttribute('height', '90')
  })

  it('カスタム size が適用される', () => {
    const { container } = render(<DonutChart segments={segments} size={120} />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('width', '120')
    expect(svg).toHaveAttribute('height', '120')
  })

  it('セグメントが空でも描画できる', () => {
    const { container } = render(<DonutChart segments={[]} />)
    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
  })
})
