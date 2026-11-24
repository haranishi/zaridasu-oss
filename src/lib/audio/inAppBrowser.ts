// REQ-081: SNS in-app browser 判定。
// マイク権限を伝搬しないことが多いため、検出時は外部ブラウザでの再アクセスを促す。

export type InAppBrowserKind = 'line' | 'twitter' | 'instagram' | 'facebook' | 'tiktok' | null

export function detectInAppBrowser(userAgent?: string): InAppBrowserKind {
  if (typeof navigator === 'undefined' && !userAgent) return null
  const ua = userAgent ?? navigator.userAgent ?? ''
  if (/\bLine\//i.test(ua)) return 'line'
  if (/\bTwitter\b|TwitterBrowser/i.test(ua)) return 'twitter'
  if (/\bInstagram\b/i.test(ua)) return 'instagram'
  if (/\bFBAN\b|\bFBAV\b|\bFB_IAB\b/i.test(ua)) return 'facebook'
  if (/\bTikTok\b/i.test(ua)) return 'tiktok'
  return null
}

export type DeviceOS = 'ios' | 'android' | 'macos' | 'windows' | 'linux' | 'unknown'

export function detectDeviceOS(userAgent?: string): DeviceOS {
  if (typeof navigator === 'undefined' && !userAgent) return 'unknown'
  const ua = userAgent ?? navigator.userAgent ?? ''
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  if (/Macintosh|Mac OS X/i.test(ua)) return 'macos'
  if (/Windows/i.test(ua)) return 'windows'
  if (/Linux/i.test(ua)) return 'linux'
  return 'unknown'
}

export type DeviceBrowser = 'safari' | 'chrome' | 'firefox' | 'edge' | 'unknown'

export function detectBrowser(userAgent?: string): DeviceBrowser {
  if (typeof navigator === 'undefined' && !userAgent) return 'unknown'
  const ua = userAgent ?? navigator.userAgent ?? ''
  if (/Edg\//i.test(ua)) return 'edge'
  if (/Firefox\//i.test(ua)) return 'firefox'
  if (/Chrome\/|CriOS\//i.test(ua)) return 'chrome'
  if (/Safari\//i.test(ua)) return 'safari'
  return 'unknown'
}
