import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE_SELECTOR =
  'button:not([disabled]):not([tabindex="-1"]), [href]:not([tabindex="-1"]), input:not([disabled]):not([tabindex="-1"]), select:not([disabled]):not([tabindex="-1"]), textarea:not([disabled]):not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])'

/**
 * モーダル内にフォーカスを閉じ込めるフック
 * @param ref ダイアログのルート要素への参照
 * @param active フォーカストラップが有効か（デフォルト true）
 * @param resetKey 値が変わるとトラップを張り直す（例: タブ切替・完了表示切替で
 *   focusable 要素が入れ替わるケース）。REQ-160。
 */
export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  active = true,
  resetKey?: unknown,
): void {
  const returnFocusRef = useRef<HTMLElement | null>(null)

  // resetKey によるトラップの張り直しとは分離し、開く前の要素を初回だけ保存する。
  useEffect(() => {
    if (!active) return

    if (!returnFocusRef.current && document.activeElement instanceof HTMLElement) {
      returnFocusRef.current = document.activeElement
    }

    return () => {
      const returnTarget = returnFocusRef.current
      returnFocusRef.current = null

      if (returnTarget && document.body.contains(returnTarget)) {
        returnTarget.focus()
      } else {
        document.body.focus()
      }
    }
  }, [active])

  useEffect(() => {
    const dialog = ref.current
    if (!dialog || !active) return
    const trapRoot = dialog

    trapRoot.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus()

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Tab') return

      // モーダル内の表示切替やボタン増減にも追従できるよう、Tab ごとに再取得する。
      const focusable = trapRoot.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!first || !last) return

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    trapRoot.addEventListener('keydown', handleKeyDown)
    return () => trapRoot.removeEventListener('keydown', handleKeyDown)
  }, [ref, active, resetKey])
}
