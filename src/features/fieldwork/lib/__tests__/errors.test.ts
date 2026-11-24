import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { TFunction } from 'i18next'
import { describe, expect, it } from 'vitest'

import ja from '@/locales/ja/translation.json'

import { errorMessage, errorReason, FieldworkError } from '../errors'

// REQ-330 点検 B7: 送れない理由を利用者が「何を待てばよいか」分かる文言に振り分ける。
// 上限は DB の文言で種類を分ける（どの上限かで、待つのか・整理するのかが変わる）。

const p0001 = (message: string) => ({ code: 'P0001', message })

// 画面の t() を再現する簡単な関数。errorMessage は i18next の TFunction を受け取るので、型だけ合わせる。
const t = ((key: string, opts?: Record<string, unknown>): string => {
  const value = key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], ja)
  if (typeof value !== 'string') return key
  return value.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(opts?.[name] ?? ''))
}) as unknown as TFunction

describe('errorReason', () => {
  it.each([
    ['24時間以内の投稿上限（5件）に達しました。次に投稿できる時刻: 2026-10-01 12:00', 'postLimit'],
    ['調査計画の作成上限（1日あたり30件）に達しました', 'planDayLimit'],
    ['調査計画の作成上限（1人1000件）に達しました', 'planTotalLimit'],
    ['調査地点の追加上限（1時間あたり300件）に達しました', 'stopHourLimit'],
    ['1つの計画に入れられる地点は100か所までです', 'stopPlanLimit'],
    ['希少種の記録の上限（1時間あたり60件）に達しました', 'rareHourLimit'],
    ['希少種の記録の上限（1人5000件）に達しました', 'rareTotalLimit'],
    ['計画の地点が変わっています。読み込み直してください', 'reorderStale'],
    ['ほかの上限', 'limit'],
  ])('P0001「%s」→ %s', (message, reason) => {
    expect(errorReason(p0001(message))).toBe(reason)
  })

  it('権限・通信・画面側の失敗', () => {
    expect(errorReason({ code: '42501', message: 'x' })).toBe('denied')
    expect(errorReason(new TypeError('Failed to fetch'))).toBe('offline')
    expect(errorReason(new FieldworkError('queueFull'))).toBe('queueFull')
    expect(errorReason({ code: '23514', message: 'check' })).toBe('failed')
  })

  it('振り分けに使う DB の文言は、いまの migration にある（文言を変えたら気づく）', () => {
    const root = process.cwd()
    const fieldwork = readFileSync(join(root, 'supabase/migrations/20261001000001_req330_fieldwork.sql'), 'utf8')
    for (const needle of ['調査計画の作成上限（1日', '調査計画の作成上限（1人', '調査地点の追加上限', '地点は100か所まで', '希少種の記録の上限（1時間', '希少種の記録の上限（1人', '読み込み直して']) {
      expect(fieldwork).toContain(needle)
    }
    const posts = readFileSync(join(root, 'supabase/migrations/20240101000000_initial_schema.sql'), 'utf8')
    expect(posts).toContain('投稿上限')
  })
})

describe('errorMessage', () => {
  it('上限の種類ごとに別の文言を出す', () => {
    expect(errorMessage(p0001('24時間以内の投稿上限（5件）に達しました'), t)).toBe('投稿の上限（24時間で5件）に達しました。時間をおいてください')
    expect(errorMessage(p0001('1つの計画に入れられる地点は100か所までです'), t)).toBe('1つの計画に入れられる地点は100か所までです')
    expect(errorMessage(p0001('希少種の記録の上限（1人5000件）に達しました'), t)).toBe('希少種の記録は1人5000件までです')
    expect(errorMessage(p0001('計画の地点が変わっています。読み込み直してください'), t)).toBe(
      'ほかの画面で地点が変わっていたため、読み込み直しました。もう一度並べ替えてください'
    )
  })

  it('一部だけ記録できたときは、残りが送れなかった理由も添える', () => {
    expect(errorMessage(new FieldworkError('partialQueued', 'postLimit'), t)).toBe(
      '一部だけ記録できました。残りは送信待ちに入れました（投稿の上限（24時間で5件）に達しました。時間をおいてください）'
    )
  })

  it('どの理由にも日本語の文言がある', () => {
    const reasons = [
      'offline', 'postLimit', 'planDayLimit', 'planTotalLimit', 'stopHourLimit', 'stopPlanLimit',
      'rareHourLimit', 'rareTotalLimit', 'limit', 'reorderStale', 'denied', 'queueFull', 'photosOffline', 'partialQueued', 'failed',
    ]
    for (const r of reasons) expect(t(`fieldwork.error.${r}`)).not.toBe(`fieldwork.error.${r}`)
  })
})
