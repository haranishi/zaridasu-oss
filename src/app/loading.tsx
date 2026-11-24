import { LoadingState, Skeleton } from '@/components/ui/Skeleton'

// REQ-222 (FR-222-04): ルート遷移のローディングを中央スピナーから
// 「ヘッダー + 本文ブロック」の薄いスケルトンへ。骨格を予告し CLS を抑える。
export default function Loading() {
  return (
    <LoadingState className="min-h-screen bg-(--color-bg)">
      <div className="h-14 border-b border-(--color-border)" />
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
      </div>
    </LoadingState>
  )
}
