import { Download, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { SPECIES, MUNICIPALITIES } from '@/lib/constants'
import { dialogInputCls } from '@/lib/formStyles'
import { useCsvExport } from '@/hooks/useCsvExport'
import { useProgress } from '@/hooks/useProfile'
import { useUnlocks } from '@/hooks/useUnlocks'
import UnlockTeaser from '@/components/ui/UnlockTeaser'
import { useAuth } from '@/context/AuthContext'
import { useToastContext } from '@/context/ToastContext'
import { cardCls, faint, subheading } from '@/lib/themeClasses'

interface CSVExportSectionProps {
  dark: boolean
}

export default function CSVExportSection({ dark }: CSVExportSectionProps) {
  const { user } = useAuth()
  const { t } = useTranslation()
  const toast = useToastContext()
  const { csvFilters, setCsvFilters, exporting, exportCSV } = useCsvExport(user ? { id: user.id } : null)
  const inputCls = dialogInputCls(dark)

  // REQ-249: CSV 出力（自分のデータの持ち出し＝データツール）は Lv4 で解放。匿名/未取得はフェイルオープン。
  //   出力対象は「既に公開済み」の投稿列（粗化座標・PII/精度なし・RLS 準拠）のみのため、client 判定で十分
  //   （改竄されても公開データの早期取得に留まり、保護データや課金には触れない＝FR-249-04）。
  const { progress } = useProgress(user?.id)
  const { isUnlocked, unlockLevelOf } = useUnlocks(progress?.level)
  const csvUnlocked = isUnlocked('csv_export')
  const csvUnlockLevel = unlockLevelOf('csv_export') ?? 0

  async function handleExportCSV() {
    // REQ-247 L2: ネイティブ alert + ハードコード日本語を、アプリ共通の toast + 4言語 i18n に置換。
    const ok = await exportCSV()
    if (!ok) toast.error(t('dashboard.csvExportError'))
  }

  // REQ-249 FR-249-03: ロック時は非表示にせず「解放予告」を出す（既存 UI を壊さない・目標化する）。
  if (!csvUnlocked) {
    return (
      <div className={cardCls(dark)}>
        <h2 className={`text-sm font-semibold mb-2 flex items-center gap-2 ${subheading(dark)}`}>
          <Download size={15} />
          {t('unlocks.features.csv_export')}
        </h2>
        <UnlockTeaser unlockLevel={csvUnlockLevel} currentXp={progress?.xp} dark={dark} />
        <p className={`text-xs mt-2 ${faint(dark)}`}>{t('unlocks.hint')}</p>
      </div>
    )
  }

  return (
    <div className={cardCls(dark)}>
      <h2 className={`text-sm font-semibold mb-4 flex items-center gap-2 ${subheading(dark)}`}>
        <Download size={15} />
        CSVエクスポート
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
        <div>
          <label htmlFor="csv-export-from" className={`block text-xs mb-1 ${faint(dark)}`}>開始日</label>
          <input
            id="csv-export-from"
            type="date"
            value={csvFilters.from}
            onChange={(e) => setCsvFilters((f) => ({ ...f, from: e.target.value }))}
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor="csv-export-to" className={`block text-xs mb-1 ${faint(dark)}`}>終了日</label>
          <input
            id="csv-export-to"
            type="date"
            value={csvFilters.to}
            onChange={(e) => setCsvFilters((f) => ({ ...f, to: e.target.value }))}
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor="csv-export-species" className={`block text-xs mb-1 ${faint(dark)}`}>種類</label>
          <select
            id="csv-export-species"
            value={csvFilters.species}
            onChange={(e) => setCsvFilters((f) => ({ ...f, species: e.target.value }))}
            className={inputCls}
          >
            <option value="">すべて</option>
            {SPECIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="csv-export-municipality" className={`block text-xs mb-1 ${faint(dark)}`}>市区町村</label>
          <select
            id="csv-export-municipality"
            value={csvFilters.municipality}
            onChange={(e) => setCsvFilters((f) => ({ ...f, municipality: e.target.value }))}
            className={inputCls}
          >
            <option value="">すべて</option>
            {MUNICIPALITIES.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 cursor-pointer py-2">
            <input
              type="checkbox"
              checked={csvFilters.myOnly}
              onChange={(e) => setCsvFilters((f) => ({ ...f, myOnly: e.target.checked }))}
              className="w-4 h-4 accent-red-600"
            />
            <span className={`text-sm ${dark ? 'text-slate-300' : 'text-gray-700'}`}>自分の投稿のみ</span>
          </label>
        </div>
      </div>
      <button
        onClick={handleExportCSV}
        disabled={exporting}
        className="flex items-center gap-2 bg-accent text-white font-semibold px-5 py-2.5 rounded-xl hover:bg-(--color-accent-hover) disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm shadow-md shadow-red-500/20 active:scale-[0.98]"
      >
        {exporting ? (
          <><Loader2 size={15} className="animate-spin" />エクスポート中...</>
        ) : (
          <><Download size={15} />CSVをダウンロード</>
        )}
      </button>
    </div>
  )
}
