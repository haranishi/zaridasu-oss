// REQ-330: 本物の i18next（ja の辞書）で描画するための補助。
// react-i18next をモックすると、補間（{{m}} など）や文言の崩れを検出できないため、画面部品のテストはこれを使う。

import type { ReactElement } from 'react'
import { render } from '@testing-library/react'
import i18next from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'

import ja from '@/locales/ja/translation.json'

const instance = i18next.createInstance()
void instance.use(initReactI18next).init({
  lng: 'ja',
  fallbackLng: 'ja',
  resources: { ja: { translation: ja } },
  interpolation: { escapeValue: false },
  initAsync: false,
})

export function renderJa(ui: ReactElement) {
  return render(<I18nextProvider i18n={instance}>{ui}</I18nextProvider>)
}
