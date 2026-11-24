import { useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { selectPostsForUserCsv } from '@/lib/data/posts'
import { speciesLabel, infoTypeLabel } from '@/lib/constants'
import { logError } from '@/lib/errorHandler'
import { todayLocalISODate } from '@/lib/localDate'
import type { Species } from '@/types'

interface CsvFilters {
    from: string
    to: string
    species: string
    municipality: string
    myOnly: boolean
}

interface UserLike {
    id: string
    [key: string]: unknown
}

interface UseCsvExportResult {
    csvFilters: CsvFilters
    setCsvFilters: React.Dispatch<React.SetStateAction<CsvFilters>>
    exporting: boolean
    exportCSV: () => Promise<boolean>
}

export function useCsvExport(user: UserLike | null): UseCsvExportResult {
    const [exporting, setExporting] = useState(false)
    const [csvFilters, setCsvFilters] = useState<CsvFilters>({
        from: '',
        to: '',
        species: '',
        municipality: '',
        myOnly: false,
    })

    const exportCSV = async (): Promise<boolean> => {
        setExporting(true)
        try {
            // 列の構成（REQ-103 の最小列、REQ-243 の粗化座標、accuracy を入れないこと）は
            // lib/data/posts.ts が持つ。公開データセットとは列が違う（あちらの契約を壊さない）。
            let query = selectPostsForUserCsv(supabase)
            if (csvFilters.myOnly && user) query = query.eq('user_id', user.id)
            if (csvFilters.from) query = query.gte('created_at', new Date(csvFilters.from).toISOString())
            if (csvFilters.to) {
                const toDate = new Date(csvFilters.to)
                toDate.setDate(toDate.getDate() + 1)
                query = query.lt('created_at', toDate.toISOString())
            }
            // csvFilters.species は種フィルタ UI（SPECIES 由来）の値。空文字ガード後は enum ドメイン。
            if (csvFilters.species) query = query.eq('species', csvFilters.species as Species)
            if (csvFilters.municipality) query = query.eq('municipality', csvFilters.municipality)

            const { data, error } = await query.order('created_at', { ascending: false })
            if (error || !data) return false

            // REQ-243: 緯度/経度は粗化列（≒111m）。位置精度(accuracy) 列は公開しない方針のため CSV から除外。
            const headers = ['ID', '投稿日時', '観察日時', '緯度(粗)', '経度(粗)', '市区町村', '種類', '情報種別', '個体数', 'コメント', '写真枚数', '天気', '気温(°C)', '湿度(%)', '調査手法']
            // REQ-103: 列を絞り込んだため CsvPost 全体の型ではなく取得した列のみで型推論する
            const rows = data.map((p) => [
                p.id,
                new Date(p.created_at).toLocaleString('ja-JP'),
                p.observed_at ? new Date(p.observed_at).toLocaleString('ja-JP') : '',
                // REQ-243: display_lat/lng（粗化）。hidden 記録は NULL のため空欄。
                p.lat ?? '',
                p.lng ?? '',
                p.municipality ?? '',
                speciesLabel(p.species),
                infoTypeLabel(p.info_type),
                p.count ?? '',
                `"${(p.comment ?? '').replace(/"/g, '""')}"`,
                p.photos?.length ?? 0,
                p.weather ?? '',
                p.temperature ?? '',
                p.humidity ?? '',
                // REQ-174: 定点(structured)/機会記録(opportunistic) の区別。旧データは空欄
                p.survey_method === 'structured' ? '定点' : p.survey_method === 'opportunistic' ? '機会' : '',
            ])

            const csv = [headers, ...rows].map((r: (string | number | null | undefined)[]) => r.join(',')).join('\n')
            const bom = '\uFEFF'
            const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `zarigani_export_${todayLocalISODate()}.csv`
            a.click()
            URL.revokeObjectURL(url)
            return true
        } catch (error) {
            logError(error, 'useCsvExport:exportCSV')
            return false
        } finally {
            setExporting(false)
        }
    }

    return { csvFilters, setCsvFilters, exporting, exportCSV }
}
