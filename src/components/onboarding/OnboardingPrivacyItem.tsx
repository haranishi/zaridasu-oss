'use client'

import { useTranslation } from 'react-i18next'

export default function OnboardingPrivacyItem() {
  const { t } = useTranslation()
  return <li>{t('onboarding.privacy')}</li>
}
