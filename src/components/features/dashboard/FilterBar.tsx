import { useState, useEffect, useRef, useCallback } from 'react'
import { SPECIES, INFO_TYPES, MUNICIPALITIES } from '@/lib/constants'
import { SlidersHorizontal, Search, X, MapPin, ChevronDown } from 'lucide-react'
import { useTheme } from '@/context/ThemeContext'
import { useEscapeKey } from '@/hooks/useEscapeKey'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { useTranslation } from 'react-i18next'
import { PAGE_CONTAINER } from '@/lib/layout'

interface Filters {
  period: string
  municipality: string
  species: string
  infoType: string
  search: string
  sort: string
}

const DEFAULT_FILTERS: Filters = { period: '0', municipality: '', species: '', infoType: '', search: '', sort: 'newest' }

interface FilterBarProps {
  filters: Filters
  onChange: (filters: Filters) => void
  boundsFilterEnabled: boolean
  onBoundsFilterToggle?: () => void
}

export default function FilterBar({ filters, onChange, boundsFilterEnabled, onBoundsFilterToggle }: FilterBarProps) {
  const { dark } = useTheme()
  const { t } = useTranslation()
  const [showDrawer, setShowDrawer] = useState(false)
  const drawerRef = useRef<HTMLDivElement>(null)
  const closeDrawer = useCallback(() => setShowDrawer(false), [])
  useEscapeKey(closeDrawer)
  useFocusTrap(drawerRef, showDrawer)

  // REQ-191 (FR-191-01): 検索文字列をローカル state で保持し、入力へは即時反映しつつ、
  // 親 (filters.search / setFilters) へのコミットはデバウンス後にのみ行う。
  // これにより 1 打鍵ごとに親 (HomeInteractive) 全体が再レンダーするのを防ぐ。
  // 他のフィルタ（期間・市町村等）は従来どおり即時コミット。
  const [searchInput, setSearchInput] = useState(filters.search || '')
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null)
  // デバウンス中のコールバック内で最新の filters / onChange を参照するための ref
  // （300ms の間に他フィルタが変わっても、最新値へマージしてコミットする）。
  const filtersRef = useRef(filters)
  const onChangeRef = useRef(onChange)
  filtersRef.current = filters
  onChangeRef.current = onChange
  // 直近にローカルからコミットした検索値。外部同期 effect がこの値を上書きしないためのガード。
  const committedSearchRef = useRef(filters.search || '')

  // 親の filters.search が外部要因（リセット等）で変わったら、ローカル入力へ反映する。
  // 自分でコミットした値（committedSearchRef と一致）は無視し、入力中のキー入力を消さない。
  useEffect(() => {
    const next = filters.search || ''
    if (next !== committedSearchRef.current) {
      committedSearchRef.current = next
      setSearchInput(next)
    }
  }, [filters.search])

  // アンマウント時にデバウンスタイマーを掃除する。
  useEffect(() => () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current) }, [])

  const handleChange = (key: keyof Filters, value: string) => onChange({ ...filters, [key]: value })

  const handleSearchInput = (value: string) => {
    setSearchInput(value)
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    searchDebounceRef.current = setTimeout(() => {
      committedSearchRef.current = value
      onChangeRef.current({ ...filtersRef.current, search: value })
    }, 300)
  }

  const activeCount = [
    filters.period !== '0',
    !!filters.municipality,
    !!filters.species,
    !!filters.infoType,
    // REQ-191: 検索はローカル入力値を基準にし、入力欄とバッジの表示を一致させる。
    !!searchInput,
  ].filter(Boolean).length

  const handleReset = () => {
    // REQ-191: 保留中の検索デバウンスがリセット後に古い文字列を再コミットしないよう停止する。
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    committedSearchRef.current = ''
    setSearchInput('')
    onChange(DEFAULT_FILTERS)
    setShowDrawer(false)
  }

  const periodOptions = [
    { value: '7', label: t('filter.week') },
    { value: '30', label: t('filter.month') },
    { value: '90', label: t('filter.threeMonths') },
    { value: '0', label: t('filter.allPeriod') },
  ]

  const sortOptions = [
    { value: 'newest', label: t('filter.sortNewest') },
    { value: 'oldest', label: t('filter.sortOldest') },
    { value: 'species', label: t('filter.sortSpecies') },
  ]

  // ドロワー内 select スタイル
  // REQ-323 FR-323-07: 390px 実測 358×41px。select もタップ対象なので 44px にする。
  const drawerInput = `w-full min-h-11 border rounded-xl px-3 py-2.5 text-sm focus:outline-hidden focus:ring-2 focus:ring-red-400 transition-colors ${
    dark
      ? 'bg-slate-800 border-slate-600/80 text-slate-200'
      : 'bg-white border-gray-200 text-gray-700'
  }`

  return (
    <>
      {/* ── 検索 + フィルターボタン ──
          REQ-320 FR-320-05: 帯（境界線・背景）は全幅のまま、中身だけ PAGE_CONTAINER に載せる。
          旧実装は素の `px-3` で 1440px の検索窓が x=12 に貼り付き、同じ画面のハンバーガー(x=98)とも
          他ページの本文(x=352)とも揃っていなかった。 */}
      <div className={`border-b shrink-0 ${
        dark ? 'bg-slate-900/95 border-slate-800' : 'bg-white border-gray-200'
      }`}>
      <div className={`${PAGE_CONTAINER} flex items-center gap-2 py-2`}>
        {/* 検索 */}
        <div className="relative flex-1 min-w-0">
          <Search size={13} className={`absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none ${dark ? 'text-slate-400' : 'text-gray-400'}`} />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => handleSearchInput(e.target.value)}
            placeholder={t('filter.searchPlaceholder')}
            aria-label={t('filter.searchPlaceholder')}
            // REQ-322 FR-322-04: プレースホルダの色を底上げする。390px ではフィールドに
            // 可視ラベルが無く、この文字列が唯一の説明なのに
            // light は gray-400(#9ca3af) on 白 = 2.54:1、dark は slate-600(#475569) on
            // slate-800 = 1.93:1 で、どちらも AA(4.5:1) の半分以下だった（Round 3 採点 #5）。
            // light gray-500 = 4.83:1 / dark slate-400 = 5.71:1。
            // REQ-323 FR-323-07: 390px 実測 187×35px でタップ域 44px に届いていなかった
            // （テキスト入力もタップ対象）。min-h-11 で 44px にする。この行の高さは隣の
            // フィルターボタン（min-h-11）が既に決めているので、バーの背は増えない。
            className={`w-full min-h-11 text-sm border rounded-full pl-7 pr-3 py-1.5 focus:outline-hidden focus:ring-2 focus:ring-red-400 ${
              dark
                ? 'bg-slate-800 border-slate-600/80 text-slate-200 placeholder-slate-400'
                : 'bg-white border-gray-200 text-gray-700 placeholder-gray-500'
            }`}
          />
        </div>

        {/* エリア絞込 */}
        {onBoundsFilterToggle && (
          <button
            onClick={onBoundsFilterToggle}
            // REQ-180 a11y(button-name): アイコンのみ（OFF 時）のボタンにアクセシブル名を付与する。
            // 表示は MapPin アイコン＋ON バッジのみだが、SR には「現在の地図範囲内のみ」を読み上げる。
            // トグルなので押下状態も aria-pressed で公開する。
            aria-label={t('filter.boundsFilter')}
            aria-pressed={boundsFilterEnabled}
            // REQ-323 FR-323-07: OFF 時は MapPin アイコンだけなので幅が 40px しか無く、
            // 高さ（44px）は満たしていても**横が 44px 未満**だった。min-w-11 を足す。
            className={`shrink-0 flex items-center justify-center gap-1 text-sm px-3 min-h-11 min-w-11 py-2.5 rounded-full border transition-colors ${
              boundsFilterEnabled
                // REQ-325 FR-325-01: red-600 on red-50 は 4.41:1 で AA 未満。brand-700 で 5.91:1。
                ? 'border-red-400 bg-red-50 text-brand-700 font-semibold'
                : dark
                  ? 'border-slate-600 text-slate-400'
                  : 'border-gray-200 text-gray-600'
            }`}
          >
            <MapPin size={14} />
            {boundsFilterEnabled && (
              <span className="bg-brand-600 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold leading-none">ON</span>
            )}
          </button>
        )}

        {/* フィルターボタン */}
        <button
          onClick={() => setShowDrawer(true)}
          // REQ-180 a11y(button-name): ラベル文字は sm 未満で hidden になるため、
          // narrow 幅でアイコンのみになっても SR 用の名前が残るよう aria-label を明示する。
          aria-label={t('filter.filter')}
          aria-expanded={showDrawer}
          className={`shrink-0 flex items-center gap-1.5 text-sm px-3 min-h-11 py-2.5 rounded-full border transition-colors ${
            activeCount > 0
              // REQ-325 FR-325-01: 同上（red-600 on red-50 = 4.41:1）。
              ? 'border-red-400 bg-red-50 text-brand-700 font-semibold'
              : dark
                ? 'border-slate-600 text-slate-400 hover:border-slate-500'
                : 'border-gray-200 text-gray-600 hover:border-gray-300'
          }`}
        >
          <SlidersHorizontal size={14} />
          {/* REQ-322 FR-322-08: 旧 `hidden sm:inline` は 390px でだけラベルを落としており、
              **最も説明が要る幅で説明が消える**状態だった（Round 3 採点 #31）。
              常時表示にする。検索欄が `flex-1 min-w-0` なので、増えた幅は検索欄が吸収する。 */}
          <span>{t('filter.filter')}</span>
          {activeCount > 0 && (
            <span className="bg-brand-600 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold leading-none">{activeCount}</span>
          )}
          <ChevronDown size={14} className="hidden sm:block" />
        </button>
      </div>
      </div>

      {/* ── フィルタードロワー ── */}
      {showDrawer && (
        <div
          ref={drawerRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="filter-drawer-title"
          className="fixed inset-0 z-430 flex flex-col justify-end"
        >
          <button
            type="button"
            tabIndex={-1}
            aria-label={t('common.close')}
            className="fixed inset-0 cursor-default border-0 bg-black/50 p-0"
            onClick={closeDrawer}
          />
          <div className={`relative rounded-t-2xl shadow-2xl ${dark ? 'bg-slate-900' : 'bg-white'}`}
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
          >
            {/* ドロワーヘッダー */}
            <div className={`flex items-center justify-between px-4 py-3.5 border-b ${dark ? 'border-slate-700/60' : 'border-gray-100'}`}>
              <h2 id="filter-drawer-title" className={`font-semibold text-sm ${dark ? 'text-slate-100' : 'text-gray-800'}`}>
                {t('filter.filterSettings')}
                {activeCount > 0 && (
                  <span className="ml-2 bg-brand-600 text-white text-[10px] rounded-full px-1.5 py-0.5 font-bold">
                    {t('filter.appliedCount', { count: activeCount })}
                  </span>
                )}
              </h2>
              {/* REQ-323 FR-323-07: 390px 実測 36×36px。 */}
              <button onClick={closeDrawer} aria-label={t('common.close')} className={`inline-flex items-center justify-center min-h-11 min-w-11 rounded-lg ${dark ? 'text-slate-400 hover:bg-slate-800' : 'text-gray-500 hover:bg-gray-100'}`}>
                <X size={20} />
              </button>
            </div>

            {/* フィルター項目 */}
            <div className="px-4 py-4 space-y-3 max-h-[60dvh] landscape:max-h-[75dvh] overflow-y-auto">
              <div>
                <label htmlFor="filter-drawer-period" className={`block text-sm font-semibold mb-1.5 ${dark ? 'text-slate-300' : 'text-gray-600'}`}>{t('filter.period')}</label>
                <select id="filter-drawer-period" value={filters.period} onChange={(e) => handleChange('period', e.target.value)} className={drawerInput}>
                  {periodOptions.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="filter-drawer-municipality" className={`block text-sm font-semibold mb-1.5 ${dark ? 'text-slate-300' : 'text-gray-600'}`}>{t('filter.municipality')}</label>
                <select id="filter-drawer-municipality" value={filters.municipality} onChange={(e) => handleChange('municipality', e.target.value)} className={drawerInput}>
                  <option value="">{t('filter.allMunicipalities')}</option>
                  {MUNICIPALITIES.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="filter-drawer-species" className={`block text-sm font-semibold mb-1.5 ${dark ? 'text-slate-300' : 'text-gray-600'}`}>{t('filter.species')}</label>
                <select id="filter-drawer-species" value={filters.species} onChange={(e) => handleChange('species', e.target.value)} className={drawerInput}>
                  <option value="">{t('filter.allSpecies')}</option>
                  {SPECIES.map((s) => <option key={s.value} value={s.value}>{t(`species.${s.value}`)}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="filter-drawer-info-type" className={`block text-sm font-semibold mb-1.5 ${dark ? 'text-slate-300' : 'text-gray-600'}`}>{t('filter.infoType')}</label>
                <select id="filter-drawer-info-type" value={filters.infoType} onChange={(e) => handleChange('infoType', e.target.value)} className={drawerInput}>
                  <option value="">{t('filter.allInfoTypes')}</option>
                  {INFO_TYPES.map((inf) => <option key={inf.value} value={inf.value}>{inf.emoji} {t(`infoType.${inf.value}`)}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="filter-drawer-sort" className={`block text-sm font-semibold mb-1.5 ${dark ? 'text-slate-300' : 'text-gray-600'}`}>{t('filter.sort')}</label>
                <select id="filter-drawer-sort" value={filters.sort || 'newest'} onChange={(e) => handleChange('sort', e.target.value)} className={drawerInput}>
                  {sortOptions.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
            </div>

            {/* ボタン */}
            <div className={`px-4 py-3 flex gap-2 border-t ${dark ? 'border-slate-700/60' : 'border-gray-100'}`}>
              <button
                onClick={handleReset}
                className={`flex-1 py-3 rounded-xl text-sm font-medium border transition-colors ${
                  dark ? 'border-slate-600 text-slate-400 hover:bg-slate-800' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {t('filter.reset')}
              </button>
              <button
                onClick={() => setShowDrawer(false)}
                className="flex-1 py-3 rounded-xl text-sm font-bold bg-accent text-white hover:bg-(--color-accent-hover) transition-all shadow-xs shadow-red-500/20 active:scale-[0.98]"
              >
                {t('filter.apply')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
