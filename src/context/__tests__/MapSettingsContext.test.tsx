import { act, renderHook } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MapSettingsProvider, useMapSettings } from '../MapSettingsContext'
import { MAP_LAYER_STORAGE_KEY } from '@/lib/constants'

function wrapper({ children }: { children: React.ReactNode }) {
  return <MapSettingsProvider>{children}</MapSettingsProvider>
}

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('地図の初期設定', () => {
  it('未設定は標準地図を表示する', () => {
    const { result } = renderHook(useMapSettings, { wrapper })
    expect(result.current.activeLayerId).toBe('osm')
    expect(result.current.defaultLayerId).toBe('osm')
  })

  it('既存の保存値を初期設定として引き継ぐ', () => {
    localStorage.setItem(MAP_LAYER_STORAGE_KEY, 'photo')
    const { result } = renderHook(useMapSettings, { wrapper })
    expect(result.current.activeLayerId).toBe('photo')
    expect(result.current.defaultLayerId).toBe('photo')
  })

  it('一時的な切替はデフォルトを上書きせず、再起動では保存した地図に戻る', () => {
    const first = renderHook(useMapSettings, { wrapper })
    act(() => {
      first.result.current.setActiveLayerId('photo')
      expect(first.result.current.setDefaultLayerId('photo')).toBe(true)
    })
    act(() => first.result.current.setActiveLayerId('std'))
    expect(first.result.current.activeLayerId).toBe('std')
    expect(first.result.current.defaultLayerId).toBe('photo')
    expect(localStorage.getItem(MAP_LAYER_STORAGE_KEY)).toBe('photo')
    first.unmount()
    const second = renderHook(useMapSettings, { wrapper })
    expect(second.result.current.activeLayerId).toBe('photo')
  })

  it('不正な保存値や未対応の地図を使わない', () => {
    localStorage.setItem(MAP_LAYER_STORAGE_KEY, 'unknown')
    const { result } = renderHook(useMapSettings, { wrapper })
    act(() => {
      result.current.setActiveLayerId('unknown')
      expect(result.current.setDefaultLayerId('unknown')).toBe(false)
    })
    expect(result.current.activeLayerId).toBe('osm')
    expect(result.current.defaultLayerId).toBe('osm')
  })

  it('保存が拒否された場合は保存済みと扱わず、その場の切替は使える', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    const { result } = renderHook(useMapSettings, { wrapper })
    act(() => {
      result.current.setActiveLayerId('photo')
      expect(result.current.setDefaultLayerId('photo')).toBe(false)
    })
    expect(result.current.activeLayerId).toBe('photo')
    expect(result.current.defaultLayerId).toBe('osm')
  })

  it('ブラウザに保存値があってもサーバー描画は初回描画と一致する', () => {
    localStorage.setItem(MAP_LAYER_STORAGE_KEY, 'photo')
    function CurrentLayer() {
      return <span>{useMapSettings().activeLayerId}</span>
    }
    expect(renderToString(<MapSettingsProvider><CurrentLayer /></MapSettingsProvider>))
      .toBe('<span>osm</span>')
  })
})
