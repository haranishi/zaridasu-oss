'use client'

import { useEffect, useRef, useState } from 'react'
import { prefersReducedMotion } from '@/lib/achievement'

/**
 * REQ-226 FR-226-07 / NFR-226-02: 初回可視時に 0→target のカウントアップ演出を行うフック。
 *
 * 厳守事項:
 * - 値（最終 target）は JS で算出し、**アニメの有無・ブラウザ非対応に関わらず最終値が DOM に出る**。
 *   演出は装飾であり、値は本体（静的フォールバック）。
 * - reduced-motion 有効時、または IntersectionObserver 非対応時は、即時 target を表示する（動かさない）。
 * - スクロール連動 CSS（animation-timeline: scroll()）は Safari 未対応のため使わず、
 *   IntersectionObserver + requestAnimationFrame の JS カウントアップで実装する。
 * - transform/opacity 系の DOM 変更は伴わない（数値テキストの差し替えのみ）ため reflow を増やさない。
 *
 * @param target アニメーションの最終値（負値や NaN は 0 に丸める）
 * @param durationMs カウントアップ時間（既定 900ms・100〜300ms 制約は「動き」を伴う transform 系アニメが対象で、
 *                   数値カウントは知覚可能性のためやや長めにとる）
 * @returns { value, ref } value=表示すべき現在値 / ref=可視判定の対象要素に付与する ref
 */
export function useCountUp(target: number, durationMs = 900) {
  const safeTarget = Number.isFinite(target) && target > 0 ? Math.floor(target) : 0
  // 初期値: reduced-motion なら最初から最終値（動かさない）。それ以外は 0 から開始。
  const [value, setValue] = useState<number>(() => (prefersReducedMotion() ? safeTarget : 0))
  const ref = useRef<HTMLElement | null>(null)
  const startedRef = useRef(false)

  useEffect(() => {
    // target が変化したら最終値へ追従（再アニメはしない。値は常に正しく保つ＝静的フォールバック）。
    if (startedRef.current || prefersReducedMotion()) {
      setValue(safeTarget)
    }
  }, [safeTarget])

  useEffect(() => {
    // 値がゼロなら演出不要（0 のまま正しい）。reduced-motion / IO 非対応は即時最終値。
    if (safeTarget === 0) return
    if (prefersReducedMotion() || typeof IntersectionObserver === 'undefined') {
      setValue(safeTarget)
      startedRef.current = true
      return
    }

    const el = ref.current
    if (!el) {
      // 参照が無い（描画前など）の場合も最終値を必ず保証する。
      setValue(safeTarget)
      startedRef.current = true
      return
    }

    let rafId = 0
    const animate = () => {
      if (startedRef.current) return
      startedRef.current = true
      const start = performance.now()
      const tick = (now: number) => {
        const progress = Math.min(1, (now - start) / durationMs)
        // ease-out（FR-226 入場は ease-out 既定）
        const eased = 1 - Math.pow(1 - progress, 3)
        setValue(Math.round(eased * safeTarget))
        if (progress < 1) {
          rafId = requestAnimationFrame(tick)
        } else {
          setValue(safeTarget) // 端数を最終値に確定
        }
      }
      rafId = requestAnimationFrame(tick)
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            animate()
            observer.disconnect()
            break
          }
        }
      },
      { threshold: 0.2 },
    )
    observer.observe(el)

    return () => {
      observer.disconnect()
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [safeTarget, durationMs])

  return { value, ref }
}
