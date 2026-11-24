import type { Database } from './database.types'

// ── DB テーブル型 ──────────────────────────────────────────────────────────
export type Post = Database['public']['Tables']['posts']['Row']
export type PostInsert = Database['public']['Tables']['posts']['Insert']
export type PostUpdate = Database['public']['Tables']['posts']['Update']

export type Comment = Database['public']['Tables']['comments']['Row']
export type Like = Database['public']['Tables']['likes']['Row']
export type Report = Database['public']['Tables']['reports']['Row']

// ── ドメイン型 ────────────────────────────────────────────────────────────
export type Species = 'american' | 'bullfrog'
// REQ-148: 生成型 (database.types.ts) を単一ソースとし、ドメイン型を導出する。
// これにより info_type の許容値が二重定義になり乖離する事態を防ぐ。
export type InfoType = NonNullable<Post['info_type']>
export type GeocodeError = '' | 'offline' | 'timeout' | 'market'

// ── 天気 ──────────────────────────────────────────────────────────────────
export type WeatherCategory =
  | 'sunny'
  | 'cloudy'
  | 'overcast'
  | 'rainy'
  | 'snowy'
  | 'thunderstorm'
  | 'unknown'

export interface WeatherData {
  weather: WeatherCategory
  temperature: number | null
  humidity: number | null
}

export interface UseWeatherResult {
  weatherData: WeatherData | null
  fetching: boolean
  weatherError: boolean
}

// ── 地図・位置 ────────────────────────────────────────────────────────────
export interface LatLng {
  lat: number
  lng: number
}

// REQ-172: 位置の取得手段。'gps'=端末 Geolocation 由来（accuracy あり）、
// 'manual'=地図クリック等の手動選択（accuracy なし）。
export type LocationSource = 'gps' | 'manual'

// ── フィルタ ──────────────────────────────────────────────────────────────
export interface PostFilter {
  period: '7' | '30' | '90' | '0'
  municipality: string
  species: Species | ''
  infoType: InfoType | ''
  search: string
  sort: 'newest' | 'oldest'
}

// ── フォーム ──────────────────────────────────────────────────────────────
export interface PostFormData {
  position: LatLng | null
  species: Species
  infoType: InfoType
  municipality: string
  comment: string
  count: string
  observedAt: string
  weather?: WeatherCategory | null
  temperature?: number | null
  humidity?: number | null
  surveyDurationMinutes?: number | null
  // REQ-086 Phase 2: 調査依頼から呼び出された結果投稿は紐付けて保存する
  surveyRequestId?: string | null
  // REQ-172: 位置精度（m）と取得手段。手動選択時は accuracy=null・source='manual'
  accuracy?: number | null
  locationSource?: LocationSource
  // REQ-174: 調査手法（既定 opportunistic。定点サイト指定時は structured）と定点サイト
  surveyMethod?: 'structured' | 'opportunistic'
  surveySiteId?: string | null
  // REQ-329: 位置を非公開（location_disclosure='hidden'）にする。未指定は種ごとの既定（公開）
  locationPrivate?: boolean
}

// ── アップロード ───────────────────────────────────────────────────────────
export interface UploadProgress {
  current: number
  total: number
}

// ── hooks 戻り値 ───────────────────────────────────────────────────────────
export interface SubmitPostOptions {
  /** 通常の送信で投稿ができたとき、作られた投稿の id で呼ぶ（圏外の下書き保存では呼ばない）。REQ-330 */
  onCreated?: (postId: string) => void
}

export interface UsePostFormResult {
  currentUser: { id: string; email?: string } | null
  photos: File[]
  photoPreviews: string[]
  photoProcessing: UploadProgress | null
  audioBlob: Blob | null
  audioMimeType: string | null
  setAudio: (blob: Blob | null, mimeType: string | null, durationMs?: number | null) => void
  loading: boolean
  error: string
  uploadProgress: UploadProgress | null
  exifPosition: LatLng | null
  showExifBanner: boolean
  // REQ-077: 画像の事前ゲート警告（blur / 低解像度）
  imageGateWarning: string | null
  dismissImageGateWarning: () => void
  setError: (error: string) => void
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  removePhoto: (index: number) => void
  applyExifPosition: () => void
  dismissExifBanner: () => void
  submitPost: (data: PostFormData, options?: SubmitPostOptions) => Promise<boolean>
  // REQ-330: fieldworkStopId は調査計画の地点から作った下書きの印（送るときに保護を確かめ直し、地点とつなぐ）
  saveOffline: (data: PostFormData, options?: { fieldworkStopId?: string }) => Promise<boolean>
}

export interface UseDeletePostResult {
  deleting: boolean
  error: string
  handleDelete: () => Promise<void>
}

export interface UseReverseGeocodeResult {
  municipality: string
  // REQ-255: 逆ジオコで解決した都道府県名（対象エリア判定用）。未解決/失敗時は ''。
  prefecture: string
  geocoding: boolean
  geocodeError: GeocodeError
  retry: () => void
}
