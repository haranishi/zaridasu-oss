import { LoadingState, Skeleton } from '@/components/ui/Skeleton'

// REQ-222 (FR-222-04): 投稿詳細遷移の骨格スケルトン。
// 画像 + 本文 + コメント枠の並びに寄せて CLS を防ぐ。
export default function PostLoading() {
  return (
    <LoadingState className="min-h-screen bg-(--color-bg)">
      <div className="h-14 border-b border-(--color-border)" />
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <Skeleton className="aspect-video w-full rounded-2xl" />
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
        <Skeleton className="h-32 w-full rounded-2xl" />
      </div>
    </LoadingState>
  )
}
