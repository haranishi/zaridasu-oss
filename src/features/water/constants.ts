export const WATER_SURVEY_BUFFER_M = 150
export const PUBLIC_WATER_POINT_LIMIT = 1000
export const COMMUNITY_WATER_LIMIT = 200
export const WATER_REPORT_PHOTOS_BUCKET = 'water-report-photos'
export const WATER_PHOTO_SIGNED_URL_TTL_SECONDS = 60 * 60
export const WATER_REPORT_LIMITS = {
  nameMax: 80,
  noteMax: 1000,
  photosMax: 3,
  inputPhotoMaxBytes: 25 * 1024 * 1024,
  photoMaxBytes: 5 * 1024 * 1024,
  perHour: 20,
  perUser: 1000,
} as const
