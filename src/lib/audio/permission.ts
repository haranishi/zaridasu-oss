// REQ-081: Permissions API ラッパ + getUserMedia エラー分類。
// 非対応ブラウザでは 'unknown' を返し、呼び出し側は通常通り getUserMedia を試す方針。

export type MicPermissionState = 'granted' | 'prompt' | 'denied' | 'unknown'

export type MicErrorKind =
  | 'denied'        // NotAllowedError / PermissionDeniedError / SecurityError
  | 'not_found'     // NotFoundError / DevicesNotFoundError
  | 'busy'          // NotReadableError / TrackStartError (他アプリが占有)
  | 'overconstrained' // OverconstrainedError
  | 'aborted'       // AbortError
  | 'insecure'      // HTTP（isSecureContext === false）
  | 'unsupported'   // navigator.mediaDevices 自体無し
  | 'unknown'

export async function queryMicPermission(): Promise<MicPermissionState> {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) return 'unknown'
  try {
    const result = await navigator.permissions.query({
      name: 'microphone' as PermissionName,
    })
    return result.state as MicPermissionState
  } catch {
    return 'unknown'
  }
}

export function classifyMicError(err: unknown): MicErrorKind {
  if (!err || typeof err !== 'object') return 'unknown'
  const name = (err as { name?: string }).name ?? ''
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return 'denied'
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'not_found'
    case 'NotReadableError':
    case 'TrackStartError':
      return 'busy'
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return 'overconstrained'
    case 'AbortError':
      return 'aborted'
    default:
      return 'unknown'
  }
}

export function checkSecureContext(): boolean {
  if (typeof window === 'undefined') return true
  return window.isSecureContext !== false
}

export function isMediaRecorderSupported(): boolean {
  if (typeof window === 'undefined') return false
  return typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
}
