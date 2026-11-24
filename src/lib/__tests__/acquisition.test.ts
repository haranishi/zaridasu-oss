import { describe, it, expect } from 'vitest'
import {
  ACQUISITION_SOURCES,
  AUTH_FROM_STORAGE_KEY,
  AUTH_FROM_TTL_MS,
  isKnownSource,
  normalizeAuthFrom,
  OTHER_SOURCE,
  toTrackingProps,
} from '../acquisition'
import { buildShareUrl, buildCampaignUrl } from '../shareUtm'

describe('REQ-289 FR-289-03: from の台帳', () => {
  it('既存の lp を含む（REQ-176 の CTA を壊さない）', () => {
    expect(isKnownSource('lp')).toBe(true)
  })

  it('施策で使う値が一通り揃っている', () => {
    for (const key of ['game', 'ig_profile', 'ig_story', 'ig_post', 'flyer_qr', 'meishi', 'univ']) {
      expect(isKnownSource(key)).toBe(true)
    }
  })

  it('台帳の全キーに説明が付いている（追加時の意図を残すため）', () => {
    for (const [key, desc] of Object.entries(ACQUISITION_SOURCES)) {
      expect(typeof desc, `${key} の説明が文字列でない`).toBe('string')
      expect(desc.length, `${key} の説明が空`).toBeGreaterThan(0)
    }
  })

  it('未知の値は台帳に無い', () => {
    expect(isKnownSource('instagram')).toBe(false)
    expect(isKnownSource('IG')).toBe(false)
  })
})

describe('REQ-289 FR-289-04: from の正規化', () => {
  it('台帳にある値はそのまま通す', () => {
    expect(normalizeAuthFrom('lp')).toEqual({ from: 'lp' })
    expect(normalizeAuthFrom('flyer_qr')).toEqual({ from: 'flyer_qr' })
  })

  it('台帳に無い値は other へ丸め、元値を rawFrom に残す', () => {
    // 丸めるだけだと台帳の追加漏れに永久に気づけないため、元値を併せて返す。
    expect(normalizeAuthFrom('instagram')).toEqual({ from: OTHER_SOURCE, rawFrom: 'instagram' })
    expect(normalizeAuthFrom('IG')).toEqual({ from: OTHER_SOURCE, rawFrom: 'IG' })
  })

  it('表記ゆれが同じ軸へ落ちる（集計を汚さない）', () => {
    const variants = ['ig', 'instagram', 'Instagram', 'INSTA']
    for (const v of variants) {
      expect(normalizeAuthFrom(v)?.from).toBe(OTHER_SOURCE)
    }
  })

  it('前後の空白を落とす', () => {
    expect(normalizeAuthFrom('  lp  ')).toEqual({ from: 'lp' })
  })

  it('空・null・undefined・非文字列は null（from を載せない）', () => {
    expect(normalizeAuthFrom('')).toBeNull()
    expect(normalizeAuthFrom('   ')).toBeNull()
    expect(normalizeAuthFrom(null)).toBeNull()
    expect(normalizeAuthFrom(undefined)).toBeNull()
  })

  it('異常に長い値は切り詰める（計測へ丸ごと流さない）', () => {
    const long = 'x'.repeat(500)
    const result = normalizeAuthFrom(long)
    expect(result?.from).toBe(OTHER_SOURCE)
    expect(result?.rawFrom?.length).toBe(64)
  })
})

describe('REQ-289 FR-289-04: toTrackingProps', () => {
  it('台帳の値は from のみを返す', () => {
    expect(toTrackingProps('lp')).toEqual({ from: 'lp' })
  })

  it('台帳外は from=other と from_raw を返す', () => {
    expect(toTrackingProps('tiktok')).toEqual({ from: 'other', from_raw: 'tiktok' })
  })

  it('値が無ければ空オブジェクト（スプレッドしても何も足さない）', () => {
    expect(toTrackingProps(null)).toEqual({})
    expect({ method: 'email', ...toTrackingProps(null) }).toEqual({ method: 'email' })
  })
})

describe('REQ-289 NFR-289-03: 定数の集約', () => {
  it('TTL は 30 分', () => {
    expect(AUTH_FROM_TTL_MS).toBe(30 * 60 * 1000)
  })

  it('sessionStorage キーは既存の値を保つ（REQ-182 の退避データと互換）', () => {
    expect(AUTH_FROM_STORAGE_KEY).toBe('zaridasu:authFrom')
  })
})

describe('REQ-289 FR-289-01: buildShareUrl の utm_content', () => {
  it('content 未指定なら utm_content を付けない（既存の出力を変えない）', () => {
    const url = new URL(buildShareUrl({ method: 'x', path: '/post/abc' }))
    expect(url.searchParams.get('utm_source')).toBe('x')
    expect(url.searchParams.get('utm_medium')).toBe('social')
    expect(url.searchParams.get('utm_campaign')).toBe('post_share')
    expect(url.searchParams.has('utm_content')).toBe(false)
  })

  it('content 指定で utm_content が付く', () => {
    const url = new URL(buildShareUrl({ method: 'line', path: '/post/abc', content: 'thumb_a' }))
    expect(url.searchParams.get('utm_content')).toBe('thumb_a')
  })
})

describe('REQ-289 FR-289-02: buildCampaignUrl', () => {
  it('from・UTM 一式を組み立て、サインアップを自動で開く', () => {
    const url = new URL(
      buildCampaignUrl({
        medium: 'instagram',
        from: 'ig_story',
        campaign: 'deadline_list',
        content: '2026-08-02_a',
      }),
    )
    expect(url.searchParams.get('auth')).toBe('signup')
    expect(url.searchParams.get('from')).toBe('ig_story')
    expect(url.searchParams.get('utm_source')).toBe('instagram')
    // アプリ内シェア(social)と外部施策(campaign)を medium で区別する
    expect(url.searchParams.get('utm_medium')).toBe('campaign')
    expect(url.searchParams.get('utm_campaign')).toBe('deadline_list')
    expect(url.searchParams.get('utm_content')).toBe('2026-08-02_a')
  })

  it('openSignup=false ならモーダルを開かない', () => {
    const url = new URL(
      buildCampaignUrl({ medium: 'flyer', from: 'flyer_qr', campaign: 'class_handout', openSignup: false }),
    )
    expect(url.searchParams.has('auth')).toBe(false)
    expect(url.searchParams.get('from')).toBe('flyer_qr')
  })

  it('着地パスを指定できる', () => {
    const url = new URL(
      buildCampaignUrl({ medium: 'meishi', from: 'meishi', campaign: 'card_2026', path: '/lp' }),
    )
    expect(url.pathname).toBe('/lp')
  })

  it('生成した URL の from は必ず台帳の値になる（正規化で other に落ちない）', () => {
    const url = new URL(
      buildCampaignUrl({ medium: 'game', from: 'game', campaign: 'game_cta' }),
    )
    const from = url.searchParams.get('from')
    expect(normalizeAuthFrom(from)).toEqual({ from: 'game' })
  })
})
