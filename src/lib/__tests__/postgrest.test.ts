import { describe, it, expect } from 'vitest'
import { escapeIlikePattern, escapePostgrestValue } from '../postgrest'

describe('escapePostgrestValue', () => {
  it('カンマをエスケープする (.or() 句のセパレータ崩壊を防ぐ)', () => {
    expect(escapePostgrestValue('foo,bar')).toBe('foo\\,bar')
  })

  it('括弧をエスケープする (.in.(...) 抜けを防ぐ)', () => {
    expect(escapePostgrestValue('a(b)c')).toBe('a\\(b\\)c')
  })

  it('ダブルクォートをエスケープする', () => {
    expect(escapePostgrestValue('a"b')).toBe('a\\"b')
  })

  it('バックスラッシュは最初に処理されてダブルエスケープしない', () => {
    expect(escapePostgrestValue('a\\b')).toBe('a\\\\b')
  })

  it('アスタリスクをエスケープする (PostgREST ワイルドカード扱いを防ぐ)', () => {
    expect(escapePostgrestValue('a*b')).toBe('a\\*b')
  })

  it('日本語混在の正常系では構文文字以外は変化しない', () => {
    expect(escapePostgrestValue('アメリカザリガニ-2026')).toBe('アメリカザリガニ-2026')
  })

  it('空文字列は空文字列', () => {
    expect(escapePostgrestValue('')).toBe('')
  })

  it('100 文字でクリップする', () => {
    const input = 'a'.repeat(200)
    const result = escapePostgrestValue(input)
    expect(result.length).toBe(100)
  })
})

describe('escapeIlikePattern', () => {
  it('% を \\% にエスケープする', () => {
    expect(escapeIlikePattern('%abc')).toBe('\\%abc')
  })

  it('_ を \\_ にエスケープする', () => {
    expect(escapeIlikePattern('a_b')).toBe('a\\_b')
  })

  it('複数のワイルドカードを全てエスケープする', () => {
    expect(escapeIlikePattern('%abc_')).toBe('\\%abc\\_')
  })

  it('バックスラッシュを最初に処理してダブルエスケープしない', () => {
    expect(escapeIlikePattern('a\\b')).toBe('a\\\\b')
  })

  it('カンマもエスケープする (.or() 句の中で安全に使えるため)', () => {
    expect(escapeIlikePattern('a,b')).toBe('a\\,b')
  })

  it('括弧もエスケープする', () => {
    expect(escapeIlikePattern('a(b)c')).toBe('a\\(b\\)c')
  })

  it('攻撃ペイロードを潰す: xxx),municipality.eq.abc → 全部エスケープされる', () => {
    const evil = 'xxx),municipality.eq.abc'
    const escaped = escapeIlikePattern(evil)
    // クリティカルな構文文字 ) , が \ 付きになっていることを確認
    expect(escaped).toContain('\\)')
    expect(escaped).toContain('\\,')
    expect(escaped).not.toMatch(/[^\\]\),/)
  })

  it('日本語キーワードは regression なし', () => {
    expect(escapeIlikePattern('アメリカザリガニ')).toBe('アメリカザリガニ')
  })

  it('100 文字でクリップする', () => {
    const input = 'a'.repeat(200)
    const result = escapeIlikePattern(input)
    expect(result.length).toBe(100)
  })

  it('空文字列は空文字列', () => {
    expect(escapeIlikePattern('')).toBe('')
  })
})
