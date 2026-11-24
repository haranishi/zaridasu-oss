import { describe, expect, it } from 'vitest'
import {
  FOLLOW,
  INITIAL_FOLLOW_STATE,
  LOCATE_HINT,
  LOCATE_TOAST_MS,
  followReducer,
  locateTitleKey,
  toErrorKind,
  toFix,
  type FollowAction,
  type FollowState,
} from '../locationFollow'

const A = { lat: 39.72, lng: 140.1, accuracy: 12 }
const B = { lat: 39.73, lng: 140.11, accuracy: 8 }

const run = (actions: FollowAction[], from: FollowState = INITIAL_FOLLOW_STATE) => actions.reduce(followReducer, from)
const following = run([{ type: 'press' }, { type: 'fix', fix: A }])

describe('followReducer: ボタン', () => {
  it('停止で押すと取得中になり、前回のエラーと位置を捨てる', () => {
    const failed = run([{ type: 'press' }, { type: 'error', kind: 'denied' }])
    expect(failed.error).toBe('denied')
    const state = followReducer(failed, { type: 'press' })
    expect(state).toMatchObject({ mode: 'locating', fix: null, error: null })
  })

  it('取得中・追従中に押すと停止に戻り、位置を捨てる', () => {
    expect(run([{ type: 'press' }, { type: 'press' }])).toMatchObject({ mode: 'off', fix: null })
    expect(followReducer(following, { type: 'press' })).toMatchObject({ mode: 'off', fix: null, error: null })
  })

  it('一時停止中に押すと追従に戻り、位置は残す', () => {
    const paused = followReducer(following, { type: 'userMoved' })
    expect(paused.mode).toBe('paused')
    expect(followReducer(paused, { type: 'press' })).toMatchObject({ mode: 'following', fix: A })
  })
})

describe('followReducer: 位置', () => {
  it('取得中に最初の位置が届くと追従になる', () => {
    expect(following).toMatchObject({ mode: 'following', fix: A })
  })

  it('追従中・一時停止中は位置だけ更新し、モードは変えない', () => {
    expect(followReducer(following, { type: 'fix', fix: B })).toMatchObject({ mode: 'following', fix: B })
    const paused = followReducer(following, { type: 'userMoved' })
    expect(followReducer(paused, { type: 'fix', fix: B })).toMatchObject({ mode: 'paused', fix: B })
  })

  it('停止後に遅れて届いた位置は無視する', () => {
    expect(followReducer(INITIAL_FOLLOW_STATE, { type: 'fix', fix: A })).toBe(INITIAL_FOLLOW_STATE)
  })

  it('同じ座標・同じ精度の位置は、状態を作り直さない（再描画を増やさない）', () => {
    expect(followReducer(following, { type: 'fix', fix: { ...A } })).toBe(following)
  })
})

describe('followReducer: 地図を動かされたとき', () => {
  it('追従中だけ一時停止にする', () => {
    expect(followReducer(following, { type: 'userMoved' }).mode).toBe('paused')
  })

  it('停止・一時停止では何も起こさない', () => {
    const paused = followReducer(following, { type: 'userMoved' })
    for (const state of [INITIAL_FOLLOW_STATE, paused]) {
      expect(followReducer(state, { type: 'userMoved' })).toBe(state)
    }
  })
})

// 体験評価で見つかった不具合：位置を待つ間に地図を動かしても、最初の位置が届いた瞬間に引き戻されていた
describe('followReducer: 取得中に地図を動かされたとき', () => {
  const locating = followReducer(INITIAL_FOLLOW_STATE, { type: 'press' })

  it('取得中は取得中のまま（まだ位置を探している）。動かされたことだけ覚える', () => {
    const moved = followReducer(locating, { type: 'userMoved' })
    expect(moved).toMatchObject({ mode: 'locating', fix: null, moved: true })
  })

  it('覚えたあとにもう一度動かされても、状態を作り直さない（再描画を増やさない）', () => {
    const moved = followReducer(locating, { type: 'userMoved' })
    expect(followReducer(moved, { type: 'userMoved' })).toBe(moved)
  })

  it('動かされていたら、最初の位置が届いても追従にせず一時停止にする（地図を引き戻さない）。位置は残す', () => {
    const moved = followReducer(locating, { type: 'userMoved' })
    expect(followReducer(moved, { type: 'fix', fix: A })).toMatchObject({ mode: 'paused', fix: A })
  })

  it('動かされていなければ、従来どおり追従になる', () => {
    expect(followReducer(locating, { type: 'fix', fix: A })).toMatchObject({ mode: 'following', moved: false })
  })

  it('取りやめたら、動かされたことは持ち越さない（次の取得は、また追従から始まる）', () => {
    const off = run([{ type: 'press' }, { type: 'userMoved' }, { type: 'press' }])
    expect(off).toMatchObject({ mode: 'off', moved: false })
    expect(run([{ type: 'press' }, { type: 'fix', fix: A }], off).mode).toBe('following')
  })

  it('失敗して止まったときも、持ち越さない', () => {
    const failed = run([{ type: 'press' }, { type: 'userMoved' }, { type: 'error', kind: 'timeout' }])
    expect(failed).toMatchObject({ mode: 'off', moved: false })
    expect(run([{ type: 'press' }, { type: 'fix', fix: A }], failed).mode).toBe('following')
  })

  it('一時停止になったあと、押すと追従に戻る（位置は残す）', () => {
    const paused = run([{ type: 'press' }, { type: 'userMoved' }, { type: 'fix', fix: A }])
    expect(followReducer(paused, { type: 'press' })).toMatchObject({ mode: 'following', fix: A })
  })
})

describe('followReducer: エラー', () => {
  it('許可なしは、どの状態でも停止にして通知の連番を進める', () => {
    for (const from of [followReducer(INITIAL_FOLLOW_STATE, { type: 'press' }), following, followReducer(following, { type: 'userMoved' })]) {
      const state = followReducer(from, { type: 'error', kind: 'denied' })
      expect(state).toMatchObject({ mode: 'off', fix: null, error: 'denied', errorSeq: from.errorSeq + 1 })
    }
  })

  it('最初の位置が取れない（取得不能・時間切れ）ときは、停止にして通知する', () => {
    const locating = followReducer(INITIAL_FOLLOW_STATE, { type: 'press' })
    for (const kind of ['unavailable', 'timeout'] as const) {
      expect(followReducer(locating, { type: 'error', kind })).toMatchObject({ mode: 'off', error: kind })
    }
  })

  it('追従中・一時停止中の取得不能・時間切れは無視し、最後の位置を残す', () => {
    const paused = followReducer(following, { type: 'userMoved' })
    for (const from of [following, paused]) {
      for (const kind of ['unavailable', 'timeout'] as const) {
        expect(followReducer(from, { type: 'error', kind })).toBe(from)
      }
    }
  })

  it('非対応は、押した直後（停止のまま）でも通知する', () => {
    const state = followReducer(INITIAL_FOLLOW_STATE, { type: 'error', kind: 'unsupported' })
    expect(state).toMatchObject({ mode: 'off', error: 'unsupported', errorSeq: 1 })
  })

  it('停止後に遅れて届いた取得不能・時間切れ・許可なしは、通知しない', () => {
    for (const kind of ['unavailable', 'timeout', 'denied'] as const) {
      expect(followReducer(INITIAL_FOLLOW_STATE, { type: 'error', kind })).toBe(INITIAL_FOLLOW_STATE)
    }
  })

  it('同じ種類のエラーが続いても連番が進む（通知を出し直せる）', () => {
    const first = run([{ type: 'press' }, { type: 'error', kind: 'denied' }])
    const second = run([{ type: 'press' }, { type: 'error', kind: 'denied' }], first)
    expect(second.errorSeq).toBe(first.errorSeq + 1)
  })
})

describe('toFix', () => {
  const position = (coords: Partial<GeolocationCoordinates>) => ({ coords: { latitude: 39.7, longitude: 140.1, accuracy: 15, ...coords } as GeolocationCoordinates })

  it('緯度・経度・精度を取り出す', () => {
    expect(toFix(position({}))).toEqual({ lat: 39.7, lng: 140.1, accuracy: 15 })
  })

  it('精度が数でないときは null にする', () => {
    expect(toFix(position({ accuracy: Number.NaN }))?.accuracy).toBeNull()
    expect(toFix(position({ accuracy: -1 }))?.accuracy).toBeNull()
  })

  it('座標が数でない・範囲外のときは捨てる', () => {
    expect(toFix(position({ latitude: Number.NaN }))).toBeNull()
    expect(toFix(position({ longitude: Number.POSITIVE_INFINITY }))).toBeNull()
    expect(toFix(position({ latitude: 91 }))).toBeNull()
    expect(toFix(position({ longitude: -181 }))).toBeNull()
  })
})

describe('toErrorKind', () => {
  it('ブラウザのコードを分類し、未知のコードは取得不能にする', () => {
    expect([1, 2, 3, 0, 99].map(toErrorKind)).toEqual(['denied', 'unavailable', 'timeout', 'unavailable', 'unavailable'])
  })
})

describe('locateTitleKey', () => {
  it('停止は従来の文言、取得中は「取りやめる」、追従は「やめる」、一時停止は「戻る」', () => {
    expect(locateTitleKey('off')).toBe('map.locate')
    expect(locateTitleKey('locating')).toBe('map.locateCancel')
    expect(locateTitleKey('following')).toBe('map.locateStop')
    expect(locateTitleKey('paused')).toBe('map.locateResume')
  })
})

describe('LOCATE_HINT', () => {
  it('取得中の札は、時間切れの通知（20秒）より前に、2段階で出す。追従・一時停止の札は数秒で消える', () => {
    expect(LOCATE_HINT.slowMs).toBeLessThan(LOCATE_HINT.verySlowMs)
    expect(LOCATE_HINT.verySlowMs).toBeLessThan(FOLLOW.geolocation.timeout)
    expect(LOCATE_HINT.shownMs).toBeGreaterThanOrEqual(3000)
    expect(LOCATE_HINT.shownMs).toBeLessThanOrEqual(8000)
  })
})

describe('LOCATE_TOAST_MS', () => {
  it('失敗の通知は、次に押すボタンまで読める長さ（6秒以上）。体験評価で、5秒では読み切れないと指摘された', () => {
    expect(LOCATE_TOAST_MS.error).toBeGreaterThanOrEqual(6000)
    expect(LOCATE_TOAST_MS.filterOff).toBeGreaterThanOrEqual(4000)
  })
})

describe('FOLLOW', () => {
  it('車の追従に必要な取得設定を持つ（高精度・古い位置を使わない・起動直後の GPS を待てる）', () => {
    expect(FOLLOW.geolocation).toEqual({ enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 })
    expect(FOLLOW.firstFixZoom).toBe(14)
    expect(FOLLOW.deadZonePx).toBe(8)
    // ズームで止めない許容は、地図を寄せ直す閾値（8px）より十分大きい
    expect(FOLLOW.zoomShiftPx).toBeGreaterThan(FOLLOW.deadZonePx * 4)
  })
})
