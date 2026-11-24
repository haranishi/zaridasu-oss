import { describe, expect, it } from 'vitest'
import { parsePostPreset, postPresetHref } from '@/lib/postPreset'

describe('parsePostPreset（/map?post=1&postSpecies=…&postType=…）', () => {
  it('定義にある種・種類を読む', () => {
    expect(parsePostPreset(new URLSearchParams('post=1&postSpecies=bullfrog'))).toEqual({ species: 'bullfrog' })
    expect(parsePostPreset(new URLSearchParams('post=1&postType=absence'))).toEqual({ infoType: 'absence' })
    expect(parsePostPreset(new URLSearchParams('postSpecies=american&postType=trace'))).toEqual({ species: 'american', infoType: 'trace' })
  })

  it('定義にない値・書き換えられた値は無視する。有効な値が1つもなければ null', () => {
    expect(parsePostPreset(new URLSearchParams('postSpecies=dragon&postType=<script>'))).toBeNull()
    expect(parsePostPreset(new URLSearchParams('postSpecies=dragon&postType=capture'))).toEqual({ infoType: 'capture' })
    expect(parsePostPreset(new URLSearchParams('post=1'))).toBeNull()
  })

  it('地図の絞り込み用の species クエリとは混ざらない', () => {
    expect(parsePostPreset(new URLSearchParams('species=bullfrog'))).toBeNull()
  })
})

describe('postPresetHref', () => {
  it('事前選択がなければ従来どおり /map?post=1', () => {
    expect(postPresetHref()).toBe('/map?post=1')
    expect(postPresetHref(null)).toBe('/map?post=1')
    expect(postPresetHref({})).toBe('/map?post=1')
  })

  it('事前選択を地図ページへ渡し、読み返すと同じ値になる', () => {
    const href = postPresetHref({ species: 'bullfrog', infoType: 'absence' })
    expect(href).toBe('/map?post=1&postSpecies=bullfrog&postType=absence')
    expect(parsePostPreset(new URL(href, 'https://example.test').searchParams)).toEqual({ species: 'bullfrog', infoType: 'absence' })
  })
})
