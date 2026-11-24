'use client'

import { useTranslation } from 'react-i18next'
import styles from './home.module.css'

/** 生成した説明用の画像であることを、画像の左下に重ねて示す。公開記録の写真には付けない。 */
export default function IllustrationTag() {
  const { t } = useTranslation()
  return <span className={styles.illustrationTag}>{t('homeHub.illustrationTag')}</span>
}
