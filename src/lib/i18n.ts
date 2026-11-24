'use client'

import i18n, { type BackendModule } from 'i18next'
import { initReactI18next } from 'react-i18next'

import ja from '@/locales/ja/translation.json'

// REQ-145: 4 言語静的 import → 初期は `ja` のみ embed、残りは
// 動的 import で言語切替時に取得して chunk を分割する。
// 既存の `useTranslation` / `t(...)` 呼び出しは無改修で動作する。

const SUPPORTED_LANGS = ['ja', 'en', 'zh', 'ko'] as const
type SupportedLang = (typeof SUPPORTED_LANGS)[number]

async function loadLocale(lng: string): Promise<Record<string, unknown>> {
  // import先を固定し、ja以外の辞書はそれぞれ別chunkに保つ。
  switch (lng) {
    case 'en': return (await import('@/locales/en/translation.json')).default
    case 'zh': return (await import('@/locales/zh/translation.json')).default
    case 'ko': return (await import('@/locales/ko/translation.json')).default
    case 'ja': return ja
    default: return {}
  }
}

// backendが辞書の読込を終えてからlanguageChangedを発火する。直接changeLanguageする既存UIも更新される。
const localeBackend: BackendModule = {
  type: 'backend',
  init() {},
  read(lng, _namespace, callback) {
    void loadLocale(lng).then(
      (resources) => callback(null, resources),
      (error: unknown) => {
        // eslint-disable-next-line no-console
        console.warn(`[i18n] failed to load locale ${lng}:`, error)
        // retryableとして次の本人操作で再読込できるようにする（自動retryは行わない）。
        callback(error instanceof Error ? error : new Error(String(error)), true)
      },
    )
  },
}

const isDev = process.env.NODE_ENV !== 'production'
// detectorのimportを待たずに初期化する。SSRと最初のclient renderは必ず同じ日本語になる。
void i18n.use(localeBackend).use(initReactI18next).init({
  resources: { ja: { translation: ja } },
  partialBundledLanguages: true,
  supportedLngs: [...SUPPORTED_LANGS],
  fallbackLng: 'ja',
  lng: 'ja',
  initAsync: false,
  maxRetries: 0,
  interpolation: { escapeValue: false },
  saveMissing: isDev,
  missingKeyHandler: isDev
    ? (lngs, ns, key) => {
        const lng = Array.isArray(lngs) ? lngs.join(',') : lngs
        // eslint-disable-next-line no-console
        console.warn(`[i18n] missing key: ${ns}:${key} (lang=${lng})`)
      }
    : undefined,
})

let languageChangeVersion = 0
let requestedLanguage: string | undefined
i18n.on('languageChanging', (lng) => {
  languageChangeVersion++
  requestedLanguage = lng
})
i18n.on('languageChanged', (lng) => {
  if (typeof document !== 'undefined') document.documentElement.lang = lng
})

if (typeof document !== 'undefined') document.documentElement.lang = 'ja'

/** 既存呼び出し用。backend connectorが同じ言語の並行読込もまとめる。 */
async function ensureLocaleLoaded(lng: string): Promise<void> {
  if (!SUPPORTED_LANGS.includes(lng as SupportedLang) || i18n.hasResourceBundle(lng, 'translation')) return
  await i18n.reloadResources(lng, 'translation')
}

let clientLanguageRestored: Promise<void> | undefined

/** Providersのmount後にだけ呼ぶ。言語検出を最初のhydrateより先に走らせない。 */
function restoreClientLanguage(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (clientLanguageRestored) return clientLanguageRestored
  clientLanguageRestored = (async () => {
    const LanguageDetector = (await import('i18next-browser-languagedetector')).default
    const detector = new LanguageDetector(i18n.services, {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'zaridasu_lang',
    })
    const detect = detector.detect.bind(detector)
    detector.detect = () => {
      try { return detect() } catch { return detect(['navigator']) }
    }
    const cache = detector.cacheUserLanguage.bind(detector)
    detector.cacheUserLanguage = (lng) => {
      try { cache(lng) } catch { /* 保存できない端末でも言語切替はできる */ }
    }
    i18n.use(detector)
    i18n.services.languageDetector = detector
    if (languageChangeVersion === 0) await i18n.changeLanguage()
    // 同じJAの選び直しや辞書の読込途中も、本人が選んだ言語を優先する。
    else detector.cacheUserLanguage(requestedLanguage ?? i18n.language)
  })().catch((error: unknown) => {
    // eslint-disable-next-line no-console
    console.warn('[i18n] failed to detect language:', error)
  })
  return clientLanguageRestored
}

export { ensureLocaleLoaded, restoreClientLanguage }
export default i18n
