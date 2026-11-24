'use client'

// REQ-330: ピンと非公開スポットの吹き出し（PersonalMapLayer）に出す「計画に入れる」「希少種を記録」。
// 押すと lib/bridge.ts のイベントで FieldworkLayer に頼むだけ。調査のフックやパネルはここから読み込まない
// （吹き出しは地図のチャンクに入るので、ここを小さく保つ）。

import { ClipboardPlus, Lock } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { requestFieldwork, type FieldworkRequest } from '../lib/bridge'

const btn =
  'inline-flex items-center justify-center gap-1 min-h-11 px-3 rounded-xl text-xs font-semibold border transition-colors'

export default function FieldworkPopupActions(props: Omit<FieldworkRequest, 'action'>) {
  const { t } = useTranslation()
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5" data-testid="fieldwork-popup-actions">
      <button
        type="button"
        onClick={() => requestFieldwork({ action: 'addStop', ...props })}
        className={`${btn} border-emerald-700 bg-emerald-50 text-emerald-900 hover:bg-emerald-100`}
      >
        <ClipboardPlus size={12} aria-hidden="true" />
        {t('fieldwork.bridge.addToPlan')}
      </button>
      <button
        type="button"
        onClick={() => requestFieldwork({ action: 'recordRare', ...props })}
        className={`${btn} border-violet-300 bg-violet-50 text-violet-800 hover:bg-violet-100`}
      >
        <Lock size={12} aria-hidden="true" />
        {t('fieldwork.bridge.recordRare')}
      </button>
    </div>
  )
}
