'use client'

// REQ-330: 調査（計画→案内→記録）の地図レイヤーの入口。MapView に 1 行（PersonalMapLayer の次）で差し込む。
//
// ここは地図と一緒に、ホームを開いた全員に配られる。だから持つのは小さなものだけにする:
//   - 右下の「調査」ボタン（MapActionStack の列）と、パネルの開閉（mode）
//   - ピン・非公開スポットの吹き出しからの依頼（lib/bridge.ts のイベント）の受け口
//   - 未ログインならログイン画面
// 計画の地点の丸・希少種の記録の表示・「地図で選ぶ」・パネル・シートは本体（FieldworkSession）にあり、
// 「調査」を押したとき・吹き出しから頼まれたとき・送信待ちが端末に残っているときにだけ読み込む。
// アカウントが替わると MapView が key を替えてこのレイヤーごと作り直す（前の人の計画・送信待ちを出さない）。

import { memo, useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import dynamic from 'next/dynamic'
import { useMap } from 'react-leaflet'
import { ClipboardList } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { MapAction, MAP_ACTION_ORDER } from '@/components/features/map/MapActionStack'

import { FIELDWORK_REQUEST_EVENT, type FieldworkRequest } from '../lib/bridge'
import { countQueuedItems } from '../lib/localData'
import type { PanelMode } from './FieldworkSession'

const FieldworkSession = dynamic(() => import('./FieldworkSession'), { ssr: false })
const AuthModal = dynamic(() => import('@/components/modals/AuthModal'), { ssr: false })

/** その人の送信待ちが端末に残っているか（中身は検めない。本体を読み込むかどうかの判断だけ）。 */
function hasQueued(userId: string): boolean {
  return countQueuedItems(userId) > 0
}

function FieldworkLayer({ userId }: { userId: string | null }) {
  const { t } = useTranslation()
  const map = useMap()
  const [mode, setMode] = useState<PanelMode>('closed')
  // 本体を読み込んだら、あとは閉じても読み込んだまま（地点の丸や送信待ちの送信を続ける）
  const [loaded, setLoaded] = useState(() => !!userId && hasQueued(userId))
  const [request, setRequest] = useState<FieldworkRequest | null>(null)
  const [progress, setProgress] = useState({ finished: 0, total: 0 })
  const [showAuth, setShowAuth] = useState(false)

  // 吹き出しの「計画に入れる」「希少種を記録」
  useEffect(() => {
    const onRequest = (event: Event) => {
      const req = (event as CustomEvent<FieldworkRequest>).detail
      if (!req) return
      map.closePopup()
      if (!userId) {
        setShowAuth(true)
        return
      }
      setLoaded(true)
      setRequest(req)
    }
    window.addEventListener(FIELDWORK_REQUEST_EVENT, onRequest)
    return () => window.removeEventListener(FIELDWORK_REQUEST_EVENT, onRequest)
  }, [map, userId])

  // 圏外で溜めた記録があるまま電波が戻ったら、本体を読み込んで送る（本体の中でも online を見ている）
  useEffect(() => {
    if (!userId) return
    const onOnline = () => {
      if (hasQueued(userId)) setLoaded(true)
    }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [userId])

  const onToggle = () => {
    map.closePopup()
    if (!userId) {
      setShowAuth(true)
      return
    }
    setLoaded(true)
    setMode('open')
  }
  const clearRequest = useCallback(() => setRequest(null), [])

  return (
    <>
      {/* 右下の列（MapActionStack）のいちばん上。並びは MAP_ACTION_ORDER が決める。
          パネルを開いている間は、パネルの見出しと重なるので隠す（畳む・閉じるはパネルにある） */}
      {mode !== 'open' && (
        <MapAction order={MAP_ACTION_ORDER.fieldwork}>
          <button
            type="button"
            data-testid="fieldwork-open"
            onClick={onToggle}
            aria-expanded={false}
            className="flex items-center gap-1.5 min-h-11 px-3.5 rounded-full shadow-md bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold active:scale-95 transition-all"
          >
            <ClipboardList size={15} aria-hidden="true" />
            {t('fieldwork.button')}
            {mode === 'collapsed' && progress.total > 0 && (
              <span className="rounded-full bg-white/20 px-1.5 py-0.5 tabular-nums">
                {t('fieldwork.buttonProgress', { done: progress.finished, total: progress.total })}
              </span>
            )}
          </button>
        </MapAction>
      )}

      {loaded && userId && (
        <FieldworkSession
          userId={userId}
          mode={mode}
          onModeChange={setMode}
          request={request}
          onRequestHandled={clearRequest}
          onProgress={setProgress}
          onNeedLogin={() => setShowAuth(true)}
        />
      )}

      {showAuth &&
        typeof document !== 'undefined' &&
        createPortal(<AuthModal onClose={() => setShowAuth(false)} defaultTab="login" />, document.body)}
    </>
  )
}

export default memo(FieldworkLayer)
