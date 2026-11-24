import { describe, it, expect } from 'vitest'
import {
  resolveSurveyMethod,
  resolvePostStatus,
  resolveImageHashes,
  observedAtToIso,
} from '../postFields'

describe('resolveSurveyMethod', () => {
  it('定点サイト指定時は structured（surveyMethod に関わらず）', () => {
    expect(resolveSurveyMethod('site-1', 'opportunistic')).toBe('structured')
    expect(resolveSurveyMethod('site-1', null)).toBe('structured')
    expect(resolveSurveyMethod('site-1', undefined)).toBe('structured')
  })

  it('サイト無し + surveyMethod 指定はその値', () => {
    expect(resolveSurveyMethod(null, 'structured')).toBe('structured')
    expect(resolveSurveyMethod(undefined, 'opportunistic')).toBe('opportunistic')
  })

  it('サイト無し + surveyMethod 未指定は既定 opportunistic', () => {
    expect(resolveSurveyMethod(null, null)).toBe('opportunistic')
    expect(resolveSurveyMethod(undefined, undefined)).toBe('opportunistic')
    expect(resolveSurveyMethod('', null)).toBe('opportunistic') // 空文字 siteId は falsy
  })
})

describe('resolvePostStatus', () => {
  it('absence は自動承認（approved）', () => {
    expect(resolvePostStatus('absence')).toBe('approved')
  })

  it('absence 以外は審査待ち（pending）', () => {
    for (const t of ['sighting', 'capture', 'trace', 'damage']) {
      expect(resolvePostStatus(t)).toBe('pending')
    }
  })
})

describe('resolveImageHashes', () => {
  it('全要素が string のときは配列をそのまま返す', () => {
    expect(resolveImageHashes(['a', 'b'])).toEqual(['a', 'b'])
  })

  it('1 件でも null が混じると null', () => {
    expect(resolveImageHashes(['a', null])).toBeNull()
    expect(resolveImageHashes([null])).toBeNull()
  })

  it('空配列は null', () => {
    expect(resolveImageHashes([])).toBeNull()
  })
})

describe('observedAtToIso', () => {
  it('YYYY-MM-DD を当日 00:00 の ISO に変換する', () => {
    // ローカルタイムゾーン依存を避けるため、パース結果の整合のみ検証する
    const result = observedAtToIso('2026-03-14')
    expect(result).toBe(new Date('2026-03-14T00:00:00').toISOString())
  })

  it('null / undefined / 空文字は null', () => {
    expect(observedAtToIso(null)).toBeNull()
    expect(observedAtToIso(undefined)).toBeNull()
    expect(observedAtToIso('')).toBeNull()
  })
})
