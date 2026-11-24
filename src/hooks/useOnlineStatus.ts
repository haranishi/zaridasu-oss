'use client'

import { useSyncExternalStore } from 'react'

// REQ-197: オンライン/オフライン状態を一元管理する共通フック。
// navigator.onLine の render 時直読み（PendingPostsSection / PostForm / providers に
// 散在していた）を廃し、online/offline イベントを useSyncExternalStore で購読する。
// 複数コンポーネントが購読しても tearing を起こさず、購読は React がアンマウント時に解除する。

function subscribe(onStoreChange: () => void): () => void {
  // SSR/jsdom で window 未定義でも安全に no-op を返す
  if (typeof window === 'undefined') return () => {}
  window.addEventListener('online', onStoreChange)
  window.addEventListener('offline', onStoreChange)
  return () => {
    window.removeEventListener('online', onStoreChange)
    window.removeEventListener('offline', onStoreChange)
  }
}

function getSnapshot(): boolean {
  // navigator が無い環境（古い jsdom 等）ではオンライン扱いにフォールバック
  if (typeof navigator === 'undefined') return true
  return navigator.onLine
}

// SSR ではネットワーク状態を知り得ないためオンラインを初期値とする（楽観的）。
// クライアントで hydrate 後、getSnapshot により実際の状態へ収束する。
function getServerSnapshot(): boolean {
  return true
}

/**
 * 現在のオンライン状態を返す。
 * @returns `isOnline` — オンラインなら `true`、オフラインなら `false`
 */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
