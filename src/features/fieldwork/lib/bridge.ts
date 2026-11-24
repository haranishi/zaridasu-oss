// REQ-330: ほかの地図レイヤー（PersonalMapLayer のピンと非公開スポットの吹き出し）から、
// 「計画に入れる」「希少種を記録」を頼むための窓口。
//
// 吹き出し側に調査の部品（フック・パネル）を import させると、地図のチャンクに調査の機能が丸ごと載る。
// ここはイベント名と形だけを持つ小さなファイルで、受け取るのは FieldworkLayer だけ。

export const FIELDWORK_REQUEST_EVENT = 'zaridasu:fieldwork-request'

export interface FieldworkRequest {
  action: 'addStop' | 'recordRare'
  lat: number
  lng: number
  /** pin=立てたピン / private_spot=非公開スポット（sourceId に元の id） */
  source: 'pin' | 'private_spot'
  sourceId?: string | null
  /** 非公開スポットの名前（計画の地点名にする。外部の地図アプリへは送らない）。 */
  name?: string | null
}

export function requestFieldwork(request: FieldworkRequest): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<FieldworkRequest>(FIELDWORK_REQUEST_EVENT, { detail: request }))
}
