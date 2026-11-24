// 地図の現在地追従（.kiro/specs/map-location-follow）の純粋な部分。
// ブラウザにも地図にも依存しない。状態の遷移と、位置の変換と、定数だけを持つ。

/** 停止 → 取得中 → 追従 → （地図を動かす）一時停止 → （押す）追従。ボタン 1 つで循環する。 */
export type FollowMode = 'off' | 'locating' | 'following' | 'paused'

export type FollowErrorKind = 'denied' | 'unsupported' | 'unavailable' | 'timeout'

export interface Fix {
  lat: number
  lng: number
  /** 水平方向の誤差（m）。端末が返さないときは null */
  accuracy: number | null
}

export interface FollowState {
  mode: FollowMode
  /** 最後に届いた位置。停止に戻ると捨てる */
  fix: Fix | null
  /** 停止に戻した理由。次に押すと消える */
  error: FollowErrorKind | null
  /** 通知した回数。同じ種類のエラーが続いても、通知を出し直せるようにする連番 */
  errorSeq: number
  /** 取得中に、利用者が地図を動かしたか。動かしていたら、最初の位置が届いても追従にせず、地図を引き戻さない */
  moved: boolean
}

export type FollowAction =
  | { type: 'press' }
  | { type: 'fix'; fix: Fix }
  | { type: 'userMoved' }
  | { type: 'error'; kind: FollowErrorKind }

export const INITIAL_FOLLOW_STATE: FollowState = { mode: 'off', fix: null, error: null, errorSeq: 0, moved: false }

export const FOLLOW = {
  /** 最初の位置で寄せるときの最小ズーム。今のズームがこれより大きければ、そのまま使う */
  firstFixZoom: 14,
  /** 点が画面の中心からこの距離（px）以上離れたら、地図を寄せる。小さい縮尺では車が動いても点はほとんど動かず、毎秒動かすと境界の再計算が無駄に増える */
  deadZonePx: 8,
  /** 寄せる動きの長さ（秒）。位置は約 1 秒ごとに届くので、同じ長さにすると連続して流れて見える */
  panSeconds: 1,
  /** ズームの前後で中心がこの距離（px）以上ずれたら、ズームでなく別の場所を見に行ったとみなして一時停止にする。ボタンのズームは中心が動かない。ほかの部品の setView・flyTo や、遠くをダブルタップで拡大したときは大きくずれる */
  zoomShiftPx: 48,
  geolocation: {
    // 網による測位は数百 m〜数 km ずれて、車の追従にならない。電池を使うのは追従中だけ
    enableHighAccuracy: true,
    // 開始直後に古い位置を出さない
    maximumAge: 5000,
    // 起動直後の GPS は 10 秒を超えることがある
    timeout: 20000,
  },
} as const satisfies { firstFixZoom: number; deadZonePx: number; panSeconds: number; zoomShiftPx: number; geolocation: PositionOptions }

/** 状態の説明（札）を出す時間（ms）。取得中は、時間切れの通知（FOLLOW.geolocation.timeout）より前に2段階で出す */
export const LOCATE_HINT = {
  /** 取得中、この時間たっても位置が来ないとき「取得しています」を出す */
  slowMs: 3000,
  /** さらに遅いとき「時間がかかっています。もう一度押すと取りやめます」に変える */
  verySlowMs: 10000,
  /** 追従を始めた最初の1回と、一時停止になった最初の1回だけ出す札の長さ。2行（約35字）を歩きながら読める長さ */
  shownMs: 6000,
} as const

/** 通知を出している長さ（ms）。同じ失敗の通知を重ねない判定にも使う。失敗は、次に押すボタンまで読む必要があるので長め */
export const LOCATE_TOAST_MS = { error: 8000, filterOff: 5000 } as const

const sameFix = (a: Fix | null, b: Fix) => a !== null && a.lat === b.lat && a.lng === b.lng && a.accuracy === b.accuracy

const fail = (state: FollowState, kind: FollowErrorKind): FollowState => ({
  mode: 'off',
  fix: null,
  error: kind,
  errorSeq: state.errorSeq + 1,
  moved: false,
})

export function followReducer(state: FollowState, action: FollowAction): FollowState {
  switch (action.type) {
    case 'press':
      if (state.mode === 'off') return { mode: 'locating', fix: null, error: null, errorSeq: state.errorSeq, moved: false }
      if (state.mode === 'paused') return { ...state, mode: 'following' }
      // 取得中・追従中: 停止に戻す
      return { mode: 'off', fix: null, error: null, errorSeq: state.errorSeq, moved: false }

    case 'fix':
      // 停止後に遅れて届いた位置は使わない
      if (state.mode === 'off') return state
      if (sameFix(state.fix, action.fix)) return state
      // 取得中に利用者が地図を動かしていたら、追従にせず一時停止にする（届いた瞬間に引き戻すと、見ていた場所を奪う）
      if (state.mode === 'locating') return { ...state, fix: action.fix, mode: state.moved ? 'paused' : 'following', moved: false }
      return { ...state, fix: action.fix }

    case 'userMoved':
      if (state.mode === 'following') return { ...state, mode: 'paused' }
      // 取得中は、位置がまだ無いので一時停止にはできない。動かされたことだけ覚える
      if (state.mode === 'locating') return state.moved ? state : { ...state, moved: true }
      return state

    case 'error':
      // 非対応は押した直後に分かる（停止のまま通知する）
      if (action.kind === 'unsupported') return fail(state, action.kind)
      // 止めたあとに遅れて届いた失敗は通知しない
      if (state.mode === 'off') return state
      // 許可がない・最初の位置が取れない: 止めて通知する
      if (action.kind === 'denied' || state.mode === 'locating') return fail(state, action.kind)
      // 追従中の一時的な取得不能・時間切れ（静止中にも出る）: 最後の位置を残して待つ
      return state
  }
}

/** ブラウザの位置を Fix に直す。座標が数でない・範囲外なら捨てる。 */
export function toFix(position: Pick<GeolocationPosition, 'coords'>): Fix | null {
  const { latitude, longitude, accuracy } = position.coords
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null
  return { lat: latitude, lng: longitude, accuracy: Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : null }
}

/** GeolocationPositionError.code（1 許可なし・2 取得不能・3 時間切れ）を分類する。未知のコードは取得不能。 */
export function toErrorKind(code: number): FollowErrorKind {
  if (code === 1) return 'denied'
  if (code === 3) return 'timeout'
  return 'unavailable'
}

/** ボタンの説明文（title）の翻訳キー。名前（aria-label）は常に map.locate のまま変えない。 */
export function locateTitleKey(mode: FollowMode): 'map.locate' | 'map.locateCancel' | 'map.locateStop' | 'map.locateResume' {
  if (mode === 'paused') return 'map.locateResume'
  if (mode === 'locating') return 'map.locateCancel'
  return mode === 'off' ? 'map.locate' : 'map.locateStop'
}
