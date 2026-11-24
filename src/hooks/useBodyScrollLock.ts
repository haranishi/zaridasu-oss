import { useEffect } from 'react'

// REQ-268 FR-268-07: モーダル表示中に背景 body のスクロールを固定する共通フック。
// iOS Safari は body の overflow:hidden だけではラバーバンドで背景が動くため、
// position:fixed + top=-scrollY 方式でスクロール位置を保持したまま完全に固定する。
// 複数モーダルが同時に開くケースに備えてロックを参照カウントで管理し、
// 最後の 1 つが閉じたときにだけ元のスクロール位置へ復元する。
let lockCount = 0
let savedScrollY = 0
let savedStyles: {
  position: string
  top: string
  left: string
  right: string
  width: string
  overflow: string
} | null = null

export function useBodyScrollLock(active = true): void {
  useEffect(() => {
    if (!active || typeof document === 'undefined') return
    const { body } = document

    lockCount += 1
    if (lockCount === 1) {
      savedScrollY = window.scrollY
      savedStyles = {
        position: body.style.position,
        top: body.style.top,
        left: body.style.left,
        right: body.style.right,
        width: body.style.width,
        overflow: body.style.overflow,
      }
      body.style.position = 'fixed'
      body.style.top = `-${savedScrollY}px`
      body.style.left = '0'
      body.style.right = '0'
      body.style.width = '100%'
      body.style.overflow = 'hidden'
    }

    return () => {
      lockCount -= 1
      if (lockCount === 0 && savedStyles) {
        body.style.position = savedStyles.position
        body.style.top = savedStyles.top
        body.style.left = savedStyles.left
        body.style.right = savedStyles.right
        body.style.width = savedStyles.width
        body.style.overflow = savedStyles.overflow
        savedStyles = null
        window.scrollTo(0, savedScrollY)
      }
    }
  }, [active])
}
