import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const loads = {
  detector: vi.fn(), en: vi.fn(), zh: vi.fn(), ko: vi.fn(),
}
let englishReady: Promise<void>
let englishFailures: number
let detectorReady: Promise<void>

function browserLanguages(languages: string[]) {
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(languages)
  vi.spyOn(navigator, 'language', 'get').mockReturnValue(languages[0] ?? 'ja')
}

beforeEach(() => {
  vi.resetModules()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  localStorage.clear()
  browserLanguages(['ja-JP'])
  Object.values(loads).forEach((load) => load.mockClear())
  englishReady = Promise.resolve()
  englishFailures = 0
  detectorReady = Promise.resolve()
  // 各ケースは独立した実i18nextインスタンスで、初期化とbackendの順序を検証する。
  vi.doMock('i18next', async () => {
    const actual = await vi.importActual<typeof import('i18next')>('i18next')
    return { ...actual, default: actual.createInstance() }
  })
  vi.doMock('i18next-browser-languagedetector', async () => {
    loads.detector()
    await detectorReady
    return vi.importActual('i18next-browser-languagedetector')
  })
  vi.doMock('@/locales/en/translation.json', async () => {
    loads.en()
    if (englishFailures-- > 0) throw new Error('temporary chunk failure')
    await englishReady
    return { default: { common: { close: 'Close' } } }
  })
  vi.doMock('@/locales/zh/translation.json', () => {
    loads.zh()
    return { default: { common: { close: '关闭' } } }
  })
  vi.doMock('@/locales/ko/translation.json', () => {
    loads.ko()
    return { default: { common: { close: '닫기' } } }
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('i18nの初期化とマウント後の言語復元', () => {
  it('clientは保存言語に関わらず同期的にJAで初期化し、detectorと別辞書をまだ読まない', async () => {
    localStorage.setItem('zaridasu_lang', 'en')
    const { default: i18n } = await import('../i18n')
    expect(i18n.isInitialized).toBe(true)
    expect(i18n.language).toBe('ja')
    expect(i18n.t('common.close')).toBe('閉じる')
    expect(document.documentElement.lang).toBe('ja')
    expect(localStorage.getItem('zaridasu_lang')).toBe('en')
    expect(loads.detector).not.toHaveBeenCalled()
    expect(loads.en).not.toHaveBeenCalled()
    expect(i18n.hasResourceBundle('en', 'translation')).toBe(false)
  })

  it('復元後は保存言語をnavigatorより優先し、辞書・html lang・既存キャッシュを更新する', async () => {
    localStorage.setItem('zaridasu_lang', 'en-US')
    browserLanguages(['ko-KR'])
    const { default: i18n, restoreClientLanguage } = await import('../i18n')
    await Promise.all([restoreClientLanguage(), restoreClientLanguage()])
    expect(i18n.language).toBe('en')
    expect(i18n.t('common.close')).toBe('Close')
    expect(document.documentElement.lang).toBe('en')
    expect(localStorage.getItem('zaridasu_lang')).toBe('en')
    expect(loads.detector).toHaveBeenCalledTimes(1)
    expect(loads.en).toHaveBeenCalledTimes(1)
    expect(loads.ko).not.toHaveBeenCalled()
    expect(loads.zh).not.toHaveBeenCalled()
  })

  it.each(['read', 'write'])('localStorageの%s失敗でもnavigator言語へ切り替えられる', async (failure) => {
    browserLanguages(['ko-KR'])
    vi.spyOn(Storage.prototype, failure === 'read' ? 'getItem' : 'setItem').mockImplementation(() => { throw new Error('storage blocked') })
    const { default: i18n, restoreClientLanguage } = await import('../i18n')
    await restoreClientLanguage()
    expect(i18n.language).toBe('ko')
    expect(i18n.t('common.close')).toBe('닫기')
    expect(document.documentElement.lang).toBe('ko')
  })

  it('未対応言語しかないとJAへ戻し、別辞書を読まない', async () => {
    localStorage.setItem('zaridasu_lang', 'es')
    browserLanguages(['fr-FR'])
    const { default: i18n, restoreClientLanguage } = await import('../i18n')
    await restoreClientLanguage()
    expect(i18n.language).toBe('ja')
    expect(i18n.t('common.close')).toBe('閉じる')
    expect(loads.en).not.toHaveBeenCalled()
    expect(loads.zh).not.toHaveBeenCalled()
    expect(loads.ko).not.toHaveBeenCalled()
  })

  it('直接changeLanguageしても辞書の完了前はJAを維持し、完了後のイベントから翻訳を読める', async () => {
    let finish!: () => void
    englishReady = new Promise((resolve) => { finish = resolve })
    const { default: i18n } = await import('../i18n')
    const changed = vi.fn(() => i18n.t('common.close'))
    i18n.on('languageChanged', changed)
    const switching = i18n.changeLanguage('en')
    expect(i18n.language).toBe('ja')
    expect(i18n.t('common.close')).toBe('閉じる')
    expect(changed).not.toHaveBeenCalled()
    finish()
    await switching
    expect(changed).toHaveBeenCalledTimes(1)
    expect(changed.mock.results[0]!.value).toBe('Close')
    expect(document.documentElement.lang).toBe('en')
  })

  it('ensureLocaleLoadedは言語を切り替えず、同じ辞書を一度だけ遅延読込する', async () => {
    const { default: i18n, ensureLocaleLoaded } = await import('../i18n')
    await Promise.all([ensureLocaleLoaded('zh'), ensureLocaleLoaded('zh')])
    expect(i18n.language).toBe('ja')
    expect(i18n.hasResourceBundle('zh', 'translation')).toBe(true)
    expect(loads.zh).toHaveBeenCalledTimes(1)
    expect(loads.en).not.toHaveBeenCalled()
    await i18n.changeLanguage('zh')
    expect(i18n.t('common.close')).toBe('关闭')
    expect(loads.zh).toHaveBeenCalledTimes(1)
  })

  it.each(['changeLanguage', 'ensureLocaleLoaded'])('辞書の初回読込失敗後も%sで同じページから再試行できる', async (retry) => {
    englishFailures = 1
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { default: i18n, ensureLocaleLoaded } = await import('../i18n')
    await i18n.changeLanguage('en')
    expect(i18n.t('common.close')).toBe('閉じる')
    expect(i18n.hasResourceBundle('en', 'translation')).toBe(false)
    expect(loads.en).toHaveBeenCalledTimes(1)
    // Vitestは失敗したmock import自体をキャッシュするため、復旧後のchunk応答を差し替える。
    vi.doMock('@/locales/en/translation.json', () => {
      loads.en()
      return { default: { common: { close: 'Close' } } }
    })
    if (retry === 'changeLanguage') await i18n.changeLanguage('en')
    else await ensureLocaleLoaded('en')
    expect(loads.en).toHaveBeenCalledTimes(2)
    expect(i18n.hasResourceBundle('en', 'translation')).toBe(true)
    expect(i18n.t('common.close')).toBe('Close')
  })

  it('復元のdetector待ちに本人が選んだ言語は、辞書読込途中でも上書きしない', async () => {
    let finishDetector!: () => void
    let finishEnglish!: () => void
    detectorReady = new Promise((resolve) => { finishDetector = resolve })
    englishReady = new Promise((resolve) => { finishEnglish = resolve })
    localStorage.setItem('zaridasu_lang', 'ja')
    const { default: i18n, restoreClientLanguage } = await import('../i18n')
    const finishedChange = vi.fn()
    i18n.on('languageChanged', finishedChange)
    const restoring = restoreClientLanguage()
    const selecting = i18n.changeLanguage('en')
    expect(i18n.language).toBe('ja')
    expect(finishedChange).not.toHaveBeenCalled()
    finishDetector()
    await restoring
    expect(finishedChange).not.toHaveBeenCalled()
    expect(localStorage.getItem('zaridasu_lang')).toBe('en')
    finishEnglish()
    await selecting
    expect(i18n.language).toBe('en')
    expect(i18n.t('common.close')).toBe('Close')
  })

  it('復元待ちに同じJAを選び直した場合も保存済みの別言語で上書きしない', async () => {
    let finishDetector!: () => void
    detectorReady = new Promise((resolve) => { finishDetector = resolve })
    localStorage.setItem('zaridasu_lang', 'en')
    const { default: i18n, restoreClientLanguage } = await import('../i18n')
    const restoring = restoreClientLanguage()
    await i18n.changeLanguage('ja')
    finishDetector()
    await restoring
    expect(i18n.language).toBe('ja')
    expect(localStorage.getItem('zaridasu_lang')).toBe('ja')
    expect(loads.en).not.toHaveBeenCalled()
  })
})
