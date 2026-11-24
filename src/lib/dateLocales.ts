import type { Locale } from 'date-fns'
import { ja } from 'date-fns/locale/ja'
import { enUS } from 'date-fns/locale/en-US'
import { zhCN } from 'date-fns/locale/zh-CN'
import { ko } from 'date-fns/locale/ko'

export const DATE_LOCALES: Record<string, Locale> = { ja, en: enUS, zh: zhCN, ko }

export function getDateLocale(lang: string): Locale {
  return DATE_LOCALES[lang] ?? ja
}
