import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import StatCard from '../StatCard'

describe('StatCard', () => {
  it('label と value を表示する', () => {
    render(<StatCard label="投稿数" value={42} icon="🦞" accent="red" dark={false} />)
    expect(screen.getByText('投稿数')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('icon を表示する', () => {
    render(<StatCard label="種類" value={4} icon="🦞" accent="blue" dark={false} />)
    expect(screen.getByText('🦞')).toBeInTheDocument()
  })

  it('value が未定義の場合にダッシュ (—) を表示する', () => {
    render(<StatCard label="テスト" value={null} icon="📊" accent="gray" dark={false} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('dark モードで描画できる', () => {
    render(<StatCard label="ダーク" value={10} icon="🌙" accent="purple" dark={true} />)
    expect(screen.getByText('ダーク')).toBeInTheDocument()
    expect(screen.getByText('10')).toBeInTheDocument()
  })
})
