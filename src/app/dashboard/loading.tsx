import { LoadingState, Skeleton } from '@/components/ui/Skeleton'

// REQ-222 (FR-222-04): マイページ遷移の骨格スケルトン。
// プロフィールカード + 統計 + 投稿リストの並びに寄せて CLS を防ぐ。
export default function DashboardLoading() {
  return (
    <LoadingState className="min-h-screen bg-(--color-bg)">
      <div className="h-14 border-b border-(--color-border)" />
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        {/* プロフィールカード相当 */}
        <div className="rounded-2xl shadow-xs p-5 bg-surface border border-(--color-border) space-y-4">
          <div className="flex items-start gap-4">
            <Skeleton className="w-12 h-12 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-1/3" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        </div>
        {/* 投稿リスト相当 */}
        <div className="rounded-2xl shadow-xs p-5 bg-surface border border-(--color-border) space-y-3">
          <Skeleton className="h-4 w-32" />
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      </div>
    </LoadingState>
  )
}
