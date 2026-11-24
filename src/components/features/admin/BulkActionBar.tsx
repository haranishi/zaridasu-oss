interface BulkActionBarProps {
  selectedCount: number
  onBulkApprove: () => void
  onBulkDelete: () => void
  bulkProcessing: boolean
  bulkProgress: string | null
}

export default function BulkActionBar({
  selectedCount,
  onBulkApprove,
  onBulkDelete,
  bulkProcessing,
  bulkProgress,
}: BulkActionBarProps) {
  if (selectedCount === 0) return null

  return (
    <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-40 animate-[fadeSlideIn_0.2s_ease-out] w-[calc(100%-2rem)] max-w-md md:w-auto md:max-w-none">
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 bg-white rounded-xl shadow-2xl border border-gray-200 px-3 sm:px-5 py-3">
        <span className="text-sm font-semibold text-gray-700 whitespace-nowrap">
          ☑ {selectedCount}件
        </span>

        <div className="w-px h-6 bg-gray-200" />

        {bulkProcessing ? (
          <span className="text-sm text-gray-500">{bulkProgress || '処理中…'}</span>
        ) : (
          <>
            <button
              onClick={onBulkApprove}
              className="bg-green-500 text-white text-sm font-semibold px-3 sm:px-4 py-2 rounded-lg hover:bg-green-600 active:scale-95 transition-all whitespace-nowrap"
            >
              ✅ 承認
            </button>
            <button
              onClick={onBulkDelete}
              className="bg-red-600 text-white text-sm font-semibold px-3 sm:px-4 py-2 rounded-lg hover:bg-red-700 active:scale-95 transition-all whitespace-nowrap"
            >
              🗑 削除
            </button>
          </>
        )}
      </div>
    </div>
  )
}
