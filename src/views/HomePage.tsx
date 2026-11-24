'use client'

import { useState, useEffect, useMemo, useRef, useReducer, useCallback, memo, type ComponentProps } from 'react'
import type { Post } from '@/types/index'
import { useTranslation } from 'react-i18next'
import Header from '@/components/layout/Header'
import type { PostFilter } from '@/types/index'
import BottomNav from '@/components/layout/BottomNav'
import FilterBar from '@/components/features/dashboard/FilterBar'
import MapView, { MapErrorFallback } from '@/components/features/map/MapViewWrapper'
import ErrorBoundary from '@/components/ui/ErrorBoundary'
import type { SurveyRequest as MapSurveyRequest } from '@/components/features/map/MapView'
import dynamic from 'next/dynamic'
import { useTheme } from '@/context/ThemeContext'
import { useOnboardingMapBounds, useOnboardingPostRequest } from '@/hooks/useOnboardingStatus'
import { useAuth } from '@/context/AuthContext'
import type L from 'leaflet'
import { usePostList } from '@/hooks/posts/usePostList'
import { useSurveyRequests } from '@/hooks/survey/useSurveyRequests'
import { trackEvent } from '@/lib/analytics'

const PostForm = dynamic(() => import('@/components/features/posts/PostForm'), { ssr: false })
const SurveyRequestForm = dynamic(() => import('@/components/modals/SurveyRequestForm'), { ssr: false })
const AuthModal = dynamic(() => import('@/components/modals/AuthModal'), { ssr: false })
const SignupBanner = dynamic(() => import('@/components/features/auth/SignupBanner'), { ssr: false })
// REQ-284 (FR-284-01 / AC-18): 初回訪問の誘いポップアップ。ストーリー本体は
// providers.tsx の OnboardingHost が別途 dynamic import するため、どちらも
// / の page chunk（10KB 予算）には載らない。
const IntroPrompt = dynamic(() => import('@/components/ui/IntroPrompt'), { ssr: false })
const PhotoGallery = dynamic(() => import('@/components/features/posts/PhotoGallery'), {
  ssr: false,
  loading: () => <div className="h-full bg-gray-50 dark:bg-slate-950" />,
})

import type { SurveyRequestSeed } from '@/components/features/posts/PostForm'
import { parsePostPreset, type PostPreset } from '@/lib/postPreset'

const DEFAULT_FILTERS: PostFilter = {
  period: '0',
  municipality: '',
  species: '',
  infoType: '',
  search: '',
  sort: 'newest',
}

// ── UI ステート管理（useReducer）────────────────────────────────────────────
const initialUIState: {
  showPostForm: boolean
  showSurveyForm: boolean
  showAuthModal: boolean
  authTab: string
  mapBounds: L.LatLngBounds | null
  boundsFilterEnabled: boolean
  surveyRequestForPost: SurveyRequestSeed | null
  postPreset: PostPreset | null
} = {
  showPostForm: false,
  showSurveyForm: false,
  showAuthModal: false,
  authTab: 'login',
  mapBounds: null,
  boundsFilterEnabled: false,
  surveyRequestForPost: null,
  postPreset: null,
}

type UIAction =
  | { type: 'OPEN_POST_FORM'; surveyRequest?: SurveyRequestSeed | null; preset?: PostPreset | null }
  | { type: 'CLOSE_POST_FORM' }
  | { type: 'OPEN_SURVEY_FORM' }
  | { type: 'CLOSE_SURVEY_FORM' }
  | { type: 'OPEN_AUTH'; tab?: string }
  | { type: 'CLOSE_AUTH' }
  | { type: 'SET_MAP_BOUNDS'; bounds: L.LatLngBounds | null }
  | { type: 'TOGGLE_BOUNDS_FILTER' }
  | { type: 'DISABLE_BOUNDS_FILTER' }

function uiReducer(state: typeof initialUIState, action: UIAction) {
  switch (action.type) {
    case 'OPEN_POST_FORM':
      return { ...state, showPostForm: true, surveyRequestForPost: action.surveyRequest || null, postPreset: action.preset ?? null }
    case 'CLOSE_POST_FORM':
      return { ...state, showPostForm: false, surveyRequestForPost: null, postPreset: null }
    case 'OPEN_SURVEY_FORM':
      return { ...state, showSurveyForm: true }
    case 'CLOSE_SURVEY_FORM':
      return { ...state, showSurveyForm: false }
    case 'OPEN_AUTH':
      return { ...state, showAuthModal: true, authTab: action.tab ?? 'login' }
    case 'CLOSE_AUTH':
      return { ...state, showAuthModal: false }
    case 'SET_MAP_BOUNDS':
      return { ...state, mapBounds: action.bounds }
    case 'TOGGLE_BOUNDS_FILTER':
      return { ...state, boundsFilterEnabled: !state.boundsFilterEnabled }
    case 'DISABLE_BOUNDS_FILTER':
      return { ...state, boundsFilterEnabled: false }
    default:
      return state
  }
}

export default function HomePage() {
  const { dark } = useTheme()
  const { user, loading: authLoading } = useAuth()

  const { initialBounds, loading: regionLoading } = useOnboardingMapBounds(user?.id)
  const mapReady = !authLoading && !regionLoading

  // ── UI ステート（useReducer で一元管理） ──────────────────────────────────
  const [ui, dispatch] = useReducer(uiReducer, initialUIState)
  const { showPostForm, showSurveyForm, showAuthModal, authTab, mapBounds, boundsFilterEnabled, surveyRequestForPost, postPreset } = ui
  const [pendingSurveyRequestSeed, setPendingSurveyRequestSeed] = useState<SurveyRequestSeed | null>(null)
  const [pendingAuthTab, setPendingAuthTab] = useState<'login' | 'signup' | null>(null)
  const [pendingPost, setPendingPost] = useState(false)
  // ホームの「次に足りない記録」から来たときの、種・種類の事前選択（/map?post=1&postSpecies=…&postType=…）
  const [pendingPreset, setPendingPreset] = useState<PostPreset | null>(null)

  // ── フィルタ（usePostList への入力） ──────────────────────────────────────
  const [filters, setFilters] = useState(DEFAULT_FILTERS)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('q')) setFilters(previous => ({ ...previous, search: params.get('q')!.slice(0, 200) }))
    const species = params.get('species')
    if (species === 'american' || species === 'bullfrog') setFilters(previous => ({ ...previous, species }))
    if (params.get('post') === '1') {
      setPendingPost(true)
      setPendingPreset(parsePostPreset(params))
      params.delete('post')
      params.delete('postSpecies')
      params.delete('postType')
      window.history.replaceState(null, '', params.size ? `/map?${params}` : '/map')
    }
  }, [])

  useEffect(() => {
    if (!pendingPost || authLoading) return
    if (!user) { dispatch({ type: 'OPEN_AUTH', tab: 'signup' }); return }
    dispatch({ type: 'OPEN_POST_FORM', preset: pendingPreset })
    setPendingPost(false)
    setPendingPreset(null)
  }, [pendingPost, pendingPreset, authLoading, user])

  // ── データフェッチ（カスタムフックに分離） ────────────────────────────────
  // REQ-191 (FR-191-04): bounds フィルタ無効時は mapBounds を null に正規化する。
  // これにより boundsFilterEnabled===false のパン/ズームでは options.mapBounds が変化せず、
  // usePostList の buildQuery/fetchPosts の参照も変わらないため、無駄な再フェッチが起きない。
  // （buildQuery 側も `boundsFilterEnabled && mapBounds` のときだけ bounds を適用するため整合する）
  const options = useMemo(
    () => ({ mapBounds: boundsFilterEnabled ? mapBounds : null, boundsFilterEnabled }),
    [mapBounds, boundsFilterEnabled]
  )
  const { posts, loading, error: postsError, fetchPosts } = usePostList(filters, options)
  const { t } = useTranslation()

  // ── 調査依頼データ ─────────────────────────────────────────────────────────
  const { requests: surveyRequests, fetchRequests: fetchSurveyRequests } = useSurveyRequests()
  useEffect(() => { fetchSurveyRequests() }, [fetchSurveyRequests])

  useOnboardingPostRequest(useCallback(() => dispatch({ type: 'OPEN_POST_FORM' }), []))

  // REQ-086 Phase 2: SurveyRequestPage から「調査結果を投稿する」で遷移してきた場合は
  // sessionStorage 経由で受け取り、即時 PostForm を開く。
  // （Next.js App Router では React Router の history.state.usr は使えないため）
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = window.sessionStorage.getItem('zaridasu:surveyRequestForPost')
      if (!raw) return
      const seed = JSON.parse(raw) as SurveyRequestSeed
      window.sessionStorage.removeItem('zaridasu:surveyRequestForPost')
      if (seed && seed.id) setPendingSurveyRequestSeed(seed)
    } catch {
      window.sessionStorage.removeItem('zaridasu:surveyRequestForPost')
    }
  }, [])

  useEffect(() => {
    if (!pendingSurveyRequestSeed) return
    if (!user) {
      dispatch({ type: 'OPEN_AUTH', tab: 'signup' })
      return
    }
    dispatch({ type: 'OPEN_POST_FORM', surveyRequest: pendingSurveyRequestSeed })
    setPendingSurveyRequestSeed(null)
  }, [pendingSurveyRequestSeed, user])

  // REQ-176 (FR-176-08): LP の CTA（`/?auth=signup&from=lp`）から遷移してきた場合は
  // AuthModal を自動的に開く。`from` は GTM アトリビューション用に sessionStorage へ退避し、
  // クエリは即座に URL から取り除く（リロード・共有時の再オープンを防ぐ）。
  // useSearchParams は Suspense 境界を要求するため、クライアント限定の location 参照で代替する。
  // REQ-182 (FR-182-06): 残留による誤帰属を防ぐため、値に書き込み時刻を併記して退避する
  // （読み取り側 = AuthModal / AuthCallbackPage が TTL 超過分を破棄する）。
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const auth = params.get('auth')
    if (auth !== 'signup' && auth !== 'login') return
    const from = params.get('from')
    try {
      if (from) window.sessionStorage.setItem('zaridasu:authFrom', JSON.stringify({ v: from, t: Date.now() }))
    } catch { /* sessionStorage 不可の環境では計測のみ諦める */ }
    params.delete('auth')
    params.delete('from')
    const qs = params.toString()
    window.history.replaceState(null, '', qs ? `${window.location.pathname}?${qs}` : window.location.pathname)
    setPendingAuthTab(auth)
  }, [])

  useEffect(() => {
    if (!pendingAuthTab || authLoading) return
    // ログイン済みユーザーが LP の CTA を踏んだ場合はモーダルを開かず通常表示（REQ-176 TBD-4）
    if (!user) dispatch({ type: 'OPEN_AUTH', tab: pendingAuthTab })
    setPendingAuthTab(null)
  }, [pendingAuthTab, user, authLoading])

  // ── フィルタ変更時のデバウンスフェッチ ────────────────────────────────────
  const postsRequestedRef = useRef(false)
  // REQ-232 (FR-232-04): 検索語の確定送出（デバウンス後）用。直近送出値と重複したら送らない。
  const lastSearchTermRef = useRef<string>('')

  useEffect(() => {
    const timer = setTimeout(() => {
      postsRequestedRef.current = true
      fetchPosts() // Pass filters explicitly
      // REQ-232: GA4 推奨イベント search。デバウンス確定後、検索語が変化した時のみ送出。
      // 検索語そのものは送らない。検索対象にコメント本文が含まれるため任意の自由入力が入り、
      // 氏名・メール・電話番号が混入し得る。GA4 への PII 送信は規約違反でプロパティ全体の
      // データ削除に至るリスクがあるため、識別性のない文字数のみを送る。
      const term = (filters.search ?? '').trim()
      if (term && term !== lastSearchTermRef.current) {
        lastSearchTermRef.current = term
        trackEvent('search', { search_term_length: term.length })
      } else if (!term) {
        lastSearchTermRef.current = ''
      }
    }, postsRequestedRef.current ? 300 : 0)
    return () => clearTimeout(timer)
  }, [fetchPosts, filters]) // Add filters to dependency array

  const displayedPosts = useMemo(() => {
    if (!boundsFilterEnabled || !mapBounds) return posts
    // REQ-243: hidden 投稿は display_lat/lng（=p.lat/lng）が NULL。範囲内判定の前に座標の有無を確認する。
    return posts.filter(
      (p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && mapBounds.contains([p.lat, p.lng])
    )
  }, [posts, mapBounds, boundsFilterEnabled])

  const handlePostClick = (entry: 'header' | 'bottom_nav' | 'gallery_empty' | 'intro' = 'header') => {
    if (user) {
      // REQ-232 (FR-232-02): 投稿フォーム開始（ログイン済みで実際に開くケースのみ）。
      trackEvent('post_start', { entry })
      dispatch({ type: 'OPEN_POST_FORM' })
    } else dispatch({ type: 'OPEN_AUTH', tab: 'signup' })
  }
  const handleLoginClick = (tab = 'login') => dispatch({ type: 'OPEN_AUTH', tab })

  // REQ-232 (FR-232-04): 地図移動/ズームは連続発火するためデバウンスして 1 回に間引く。
  // 座標・bounds の生値は送らない（PII / 高カーディナリティ回避）。
  const mapInteractTimerRef = useRef<NodeJS.Timeout | null>(null)
  useEffect(() => () => { if (mapInteractTimerRef.current) clearTimeout(mapInteractTimerRef.current) }, [])
  // REQ-191 (FR-191-02): MapGalleryPager/MapView へ渡すハンドラを useCallback で安定化し、
  // React.memo(FR-191-03) と併せて検索 1 打鍵時の Leaflet ツリー再レンダーを断つ。
  // dispatch / ref はいずれも安定参照のため deps は空でよい。
  const handleBoundsChange = useCallback((bounds: L.LatLngBounds) => {
    dispatch({ type: 'SET_MAP_BOUNDS', bounds })
    if (mapInteractTimerRef.current) clearTimeout(mapInteractTimerRef.current)
    mapInteractTimerRef.current = setTimeout(() => {
      trackEvent('map_interact', { trigger: 'pan_zoom' })
    }, 1500)
  }, [])

  // Reactのsetterは参照が安定している。FilterBarの広い文字列型は従来と同じ境界で扱う。
  const handleFiltersChange = setFilters as ComponentProps<typeof FilterBar>['onChange']
  const handleBoundsFilterOff = useCallback(() => dispatch({ type: 'DISABLE_BOUNDS_FILTER' }), [])

  return (
    <div className={`flex flex-col h-dvh ${dark ? 'bg-slate-950' : 'bg-gray-50'}`}>
      <Header
        onPostClick={() => handlePostClick('header')}
        onLoginClick={handleLoginClick}
        onSurveyClick={() => {
          if (user) {
            // REQ-232 (FR-232-05): 調査依頼フォーム開始（ログイン済みで実際に開くケースのみ）。
            trackEvent('survey_request_start', { entry: 'header' })
            dispatch({ type: 'OPEN_SURVEY_FORM' })
          } else handleLoginClick('signup')
        }}
      />
      <FilterBar
        filters={filters}
        onChange={handleFiltersChange}
        boundsFilterEnabled={boundsFilterEnabled}
        onBoundsFilterToggle={() => {
          // REQ-232 (FR-232-04): 表示範囲フィルタの ON/OFF。enabled は切替後の状態。
          trackEvent('map_filter_bounds', { enabled: !boundsFilterEnabled })
          dispatch({ type: 'TOGGLE_BOUNDS_FILTER' })
        }}
      />
      {/* REQ-273 FR-273-02: 投稿取得失敗の永続バナー。消えるトーストだけだと
          「0件」と「取得失敗」を区別できず、再試行手段も無かった。 */}
      {postsError && !loading && (
        <div
          role="alert"
          className={`mx-3 mt-2 flex items-center justify-between gap-3 rounded-xl px-4 py-2.5 text-sm ${
            dark ? 'bg-red-950/60 text-red-200 border border-red-900/50' : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          <span>{t('common.loadError')}</span>
          {/* REQ-323 FR-323-07: 390px 実測 66×33px でタップ域 44px 未満だった。
              btnRetryCls（trends/ranking の再試行）と違い、ここは自前のクラスだったので取り残されていた。 */}
          <button
            type="button"
            onClick={() => { void fetchPosts() }}
            className={`shrink-0 inline-flex items-center justify-center min-h-11 min-w-11 rounded-lg px-3 py-1.5 font-semibold ${
              dark ? 'bg-red-900/60 hover:bg-red-900 text-red-100' : 'bg-red-100 hover:bg-red-200 text-red-800'
            }`}
          >
            {t('common.retry')}
          </button>
        </div>
      )}
      {/* すべての画面サイズで「地図 + 写真ギャラリー」の横スワイプページャー */}
      <MapGalleryPager
        initialBounds={initialBounds}
        mapReady={mapReady}
        posts={displayedPosts}
        allPosts={posts}
        loading={loading}
        surveyRequests={surveyRequests}
        onBoundsChange={handleBoundsChange}
        boundsFilterEnabled={boundsFilterEnabled}
        onBoundsFilterOff={handleBoundsFilterOff}
        onGalleryEmptyPost={() => handlePostClick('gallery_empty')}
      />

      {/* ボトムタブ */}
      <BottomNav
        onPostClick={() => handlePostClick('bottom_nav')}
        onLoginClick={handleLoginClick}
      />

      {showPostForm && (
        <PostForm
          onClose={() => dispatch({ type: 'CLOSE_POST_FORM' })}
          onSuccess={() => { fetchPosts(); fetchSurveyRequests() }}
          onLoginClick={() => {
            dispatch({ type: 'CLOSE_POST_FORM' })
            dispatch({ type: 'OPEN_AUTH', tab: 'login' })
          }}
          surveyRequest={surveyRequestForPost}
          preset={postPreset}
        />
      )}

      {showSurveyForm && (
        <SurveyRequestForm
          onClose={() => dispatch({ type: 'CLOSE_SURVEY_FORM' })}
          onSuccess={fetchSurveyRequests}
        />
      )}

      {showAuthModal && (
        <AuthModal onClose={() => { setPendingPost(false); dispatch({ type: 'CLOSE_AUTH' }) }} defaultTab={authTab} />
      )}

      {/* REQ-284 (FR-284-01): はじめて来た人への誘いポップアップ。表示判定・5秒遅延・
          恒久 opt-out は IntroPrompt / useIntroStory 側が持ち、ここではマウントのみ行う。
          FR-284-14 により、表示中は SignupBanner / InstallBanner が自動的に抑止される。 */}
      {!authLoading && !user && <IntroPrompt onPostClick={() => handlePostClick('intro')} />}

      {!user && (
        <SignupBanner
          onSignupClick={() => dispatch({ type: 'OPEN_AUTH', tab: 'signup' })}
          onLoginClick={() => dispatch({ type: 'OPEN_AUTH', tab: 'login' })}
        />
      )}
    </div>
  )
}

// ── 地図 + 写真ギャラリーの横スワイプページャー（全サイズ共通） ─────────────
// 地図(ssr:false)はJS起動後にしか描画されず、モバイル実測でLCPが初回タイル到着(約9秒)まで
// 遅延した。初期表示の中央タイルと同じ絵柄をSSR HTMLへ先行配置し、早期ペイントをLCP候補にする。
// 外部タイルサーバー直参照だと接続確立ぶんLCPが遅れるため、同一オリジンの静的コピーを使う。
// 画像の実体: https://b.tile.openstreetmap.org/9/455/194.png（AKITA_CENTER/AKITA_ZOOM の中央タイル、
// © OpenStreetMap contributors）。AKITA_CENTER を変えたら public/ のファイルも取得し直すこと。
// REQ-324: 実地図は表示直後に秋田県全域へ fitBounds するのでズームは 8〜9 に変わるが、この画像は
// ぼかした下敷き（object-cover）なので絵柄が厳密に一致する必要はない。
const CENTER_TILE_PLACEHOLDER = '/map-tile-placeholder.png'

interface MapGalleryPagerProps {
  initialBounds: [[number, number], [number, number]]
  mapReady: boolean
  posts: Post[]
  allPosts: Post[]
  loading: boolean
  surveyRequests: MapSurveyRequest[]
  onBoundsChange: (bounds: L.LatLngBounds) => void
  boundsFilterEnabled: boolean
  onBoundsFilterOff: () => void
  // REQ-222: 空ギャラリーのCTA。親(HomePage)の handlePostClick を経由する。
  onGalleryEmptyPost: () => void
}

// REQ-191 (FR-191-03): props 不変時の再レンダーを抑止する（既定の浅い比較）。
// 親 (HomePage) が検索 1 打鍵で再レンダーしても、posts/allPosts/surveyRequests と
// 各ハンドラ(useCallback で安定化)が同一参照なら本コンポーネントと配下の MapView を再レンダーしない。
const MapGalleryPager = memo(function MapGalleryPager({
  initialBounds,
  mapReady,
  posts,
  allPosts,
  loading,
  surveyRequests,
  onBoundsChange,
  boundsFilterEnabled,
  onBoundsFilterOff,
  onGalleryEmptyPost,
}: MapGalleryPagerProps) {
  const { dark } = useTheme()
  const { t } = useTranslation()
  const [panelIndex, setPanelIndex] = useState<0 | 1>(0)
  const touchStart = useRef<{ x: number; y: number; edge: boolean } | null>(null)
  // REQ-232 (FR-232-04): 写真ギャラリーへの切替を計測。短時間の連打は間引く。
  const lastGalleryViewRef = useRef<number>(0)
  const goToGallery = (source: 'handle' | 'swipe') => {
    if (panelIndex === 1) { setPanelIndex(1); return }
    setPanelIndex(1)
    const now = Date.now()
    if (now - lastGalleryViewRef.current < 1000) return
    lastGalleryViewRef.current = now
    trackEvent('gallery_view', { source })
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]
    if (!t) return
    // 地図との競合回避: 左右 40px の edge、または photos パネル上でのみスワイプを検知
    const vw = window.innerWidth
    const edge = t.clientX < 40 || t.clientX > vw - 40
    touchStart.current = { x: t.clientX, y: t.clientY, edge: edge || panelIndex === 1 }
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    const start = touchStart.current
    touchStart.current = null
    if (!start || !start.edge) return
    const t = e.changedTouches[0]
    if (!t) return
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.4) return
    if (dx < 0 && panelIndex === 0) goToGallery('swipe')
    else if (dx > 0 && panelIndex === 1) setPanelIndex(0)
  }

  return (
    <div
      className="relative flex-1 overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      // REQ-330: 地図のすぐ上に差し込む帯（MapTopSlot）の高さを、この枠の CSS 変数で受け取る（下の切り替えを同じだけ下げる）
      data-map-top-scope=""
    >
      <div
        className="flex h-full transition-transform duration-300 ease-out"
        style={{ width: '200%', transform: `translateX(-${panelIndex * 50}%)` }}
      >
        {/* REQ-203 (FR-203-01): 非アクティブパネルを inert 化し、オフスクリーン要素への
            Tab フォーカス漏れ（WCAG 2.4.3 / 2.4.7）を防ぐ。React 19 ネイティブの boolean
            inert を使用し、配下のボタン・リンク・マーカーを一括でフォーカス/操作対象外にする。 */}
        <div className="w-1/2 h-full relative" inert={panelIndex !== 0}>
          {/* LCP用の先行タイル。実地図と同一の画像なので、Leaflet描画後は同じ絵柄の下敷きになる。
              ぼかし+拡大は「読み込み中」の含意と、拡大表示時の粗さの目立ち回避を兼ねる。 */}
          {/* eslint-disable-next-line @next/next/no-img-element -- LCP最速化のため素のimg+fetchpriorityを使う（next/imageの最適化経路を挟まない） */}
          <img
            src={CENTER_TILE_PLACEHOLDER}
            alt=""
            aria-hidden="true"
            fetchPriority="high"
            draggable={false}
            className="absolute inset-0 h-full w-full object-cover blur-[2px] scale-105 pointer-events-none select-none"
          />
          {/* 先行タイルの帰属表示。後から載るLeaflet地図は、選択中の提供元の表示を持つ。 */}
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noopener noreferrer"
            className="zari-map-placeholder-attribution absolute bottom-0 right-0 z-0 rounded-tl bg-white/90 px-1 text-[10px] text-slate-700"
          >
            &copy; OpenStreetMap contributors
          </a>
          {/* REQ-201 (FR-201-01/02): 地図区画専用のエラーバウンダリ。チャンクロード失敗や
              leaflet 描画例外を地図枠内に閉じ込め、最上位 providers.tsx の ErrorBoundary まで
              伝播させない（フィルタバー・写真ギャラリー・調査依頼は生存）。fallback は地図枠と
              同寸で、再試行ボタンが reset を呼んで MapView を再マウント（チャンク再取得・再描画）する。 */}
          <ErrorBoundary
            context="MapView"
            fallback={(reset) => <MapErrorFallback onRetry={reset} />}
          >
            {mapReady && <MapView
              key={JSON.stringify(initialBounds)}
              initialBounds={initialBounds}
              posts={boundsFilterEnabled ? posts : allPosts}
              surveyRequests={surveyRequests}
              onBoundsChange={onBoundsChange}
              boundsFilterEnabled={boundsFilterEnabled}
              boundsFilterCount={posts.length}
              onBoundsFilterOff={onBoundsFilterOff}
            />}
          </ErrorBoundary>
        </div>
        <div className="w-1/2 h-full flex flex-col" inert={panelIndex !== 1}>
          <div className={`flex items-center justify-between px-4 py-1 border-b shrink-0 ${
            dark ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-100'
          }`}>
            {/* REQ-323 FR-323-07: 390px 実測 37.6×21px。行の py-2 を py-1 へ詰めたぶんを
                ボタン自身の min-h-11 で受け、写真パネルの表示面積を削らずに 44px を満たす。 */}
            <button
              onClick={() => setPanelIndex(0)}
              aria-label={t('home.backToMap')}
              className={`flex items-center gap-1 min-h-11 min-w-11 -ml-2 px-2 rounded-lg text-sm font-medium ${dark ? 'text-slate-300' : 'text-gray-700'}`}
            >
              <span>‹</span>
              <span>{t('home.map')}</span>
            </button>
            <span className={`text-xs ${dark ? 'text-slate-400' : 'text-gray-500'}`}>
              {t('home.swipeHint')}
            </span>
          </div>
          <div className="flex-1 overflow-hidden">
            {panelIndex === 1 ? <PhotoGallery posts={posts} loading={loading} onPostClick={onGalleryEmptyPost} /> : null}
          </div>
        </div>
      </div>
      {/* 写真ギャラリーへ誘導するエッジハンドル
          REQ-203 (FR-203-02): 見た目は h-16 w-6（24px 幅）のまま維持しつつ、透明な
          before 擬似要素で最小 44px のヒットエリアを上下左右中央に重ねてタッチ当たり判定を
          拡大する（iOS 44pt 推奨）。NFR-203-02: before は z-index を上げず、隣接レイアウトや
          地図表示領域には影響しない（pointer は親 button が受ける）。

          REQ-318 FR-318-08: 390px で「写真」の 1 文字目が消え「真」だけに見えていた原因は、
          ハンドルの幅（24px）ではなく**重なり順**だった。
           - このハンドルは以前スライダー（`style={{transform: translateX(...)}}`）の内側にあった。
             transform は**新しいスタッキングコンテキストを作る**ため、内側の z-410 は
             その中でしか効かず、外側から見ると親（z-index:auto）と同じ高さでしか積まれない。
           - そこへ `fixed z-40` の SignupBanner（max-w-lg の白カード＝390px では右端 x=378px まで）が
             重なり、ハンドル左半分（"写" の位置 x=368-378px）を覆っていた。実測値と一致する。
          そこで、同じく重なりを避ける必要があるページインジケーター（z-420）と同様に
          **スライダーの外**へ出し、アプリの z 規約（バナー 40 < ハンドル 420 < モーダル 430）に合わせる。
          外側コンテナはハンドルから見て地図パネルと同じ矩形なので、見た目の位置は変わらない。
          スライダー内の `inert` が効かなくなる代わりに、ギャラリー表示中は描画しない
          （元々「地図パネルから写真へ移動する」ためだけの導線なので、panelIndex===0 限定でよい）。 */}
      {panelIndex === 0 && (
        <button
          onClick={() => goToGallery('handle')}
          // REQ-180 a11y(label-content-name-mismatch): このボタンは可視テキスト t('home.photos')
          // （例: EN "Photos"）を持つため、アクセシブル名にその語を内包させる必要がある。
          // 旧 aria-label=t('home.openGallery')（EN "Open photo gallery"）は curate 後
          // "open photo gallery" に "photos" を含まず axe が serious 違反を出していた（JA/KO/ZH は
          // 可視語が aria-label に含まれ偶然通っていたが、CI=en-US で恒常的に失敗）。可視語を先頭へ
          // 連結し、全ロケールで「可視テキスト ⊆ アクセシブル名」を機械的に保証する。
          aria-label={`${t('home.photos')} — ${t('home.openGallery')}`}
          className={`absolute right-0 top-1/2 -translate-y-1/2 z-420 h-16 w-6 rounded-l-lg flex flex-col items-center justify-center gap-1 shadow-lg active:scale-95 transition-transform before:absolute before:top-1/2 before:left-1/2 before:-translate-x-1/2 before:-translate-y-1/2 before:min-h-[44px] before:min-w-[44px] before:w-full before:h-full before:content-[''] ${
            dark ? 'bg-slate-800/90 text-slate-200' : 'bg-white/90 text-gray-700'
          }`}
        >
          {/* 24px 幅に「写真 / Photos / 사진 / 照片」を確実に収める。折り返しても切れないよう
              leading-none をやめ leading-tight にし、行間ぶんの高さを h-16 の中で確保する。 */}
          <span className="text-[10px] font-bold tracking-tight leading-tight text-center">{t('home.photos')}</span>
          {/* REQ-322 FR-322-08: 旧 `›`（右向き）は画面外＝閉じる方向を指しており、
              「引き出す」操作と矢印の向きが逆だった（Round 3 採点 #39）。
              このハンドルは右端にあり、押すと写真パネルが**左へ**入ってくるので内向き `‹` が正しい。
              可視幅（w-6）は広げない: REQ-318 で「幅ではなく重なり順が真因」と確定しており、
              地図の表示面積を削るだけになる。タップ域は before 擬似要素で 44px 確保済み。 */}
          <span className="text-xs leading-none">‹</span>
        </button>
      )}

      {/* パネル切替（地図 / 写真）
          REQ-322 FR-322-08: 旧実装は白丸・半透明丸が 2 つ並ぶだけの**無ラベル**インジケーターで、
          何の切替かも押せるかも分からなかった（Round 3 採点 #2・🔴）。
          ラベル付きのセグメントにして、①何が切り替わるか ②いま,どちらを見ているか ③押せること
          の 3 つを表示だけで伝える。各ボタンは min-h-11(44px) でタップ域も満たす（同 #29）。
          スワイプと右端ハンドルの既存操作は変えていない（増やしただけ）。 */}
      <div
        // 下地は地図タイル（明るい）なので、白文字が 4.5:1 を満たすには黒 60% 以上が要る
        // （45% だと明るいタイル上で 3.95:1／60% で 6.58:1）。
        className="absolute top-2 left-1/2 -translate-x-1/2 z-420 flex items-stretch gap-1 p-1 rounded-full bg-black/60 backdrop-blur-sm"
        // REQ-330: 地図の上に帯（「希少種を表示中」など）を差し込んでいる間は、地図と一緒に帯の高さだけ下げる。
        // 下げないと帯の文字の上に重なって隠す（写真の側には帯が無いので、地図を見ているときだけ）
        style={panelIndex === 0 ? { top: 'calc(0.5rem + var(--zari-map-top-slot, 0px))' } : undefined}
        data-testid="home-panel-switch"
        role="group"
        aria-label={t('home.panelSwitch')}
      >
        {([
          { index: 0 as const, label: t('home.map') },
          { index: 1 as const, label: t('home.photos') },
        ]).map(({ index, label }) => (
          <button
            key={index}
            type="button"
            onClick={() => (index === 1 ? goToGallery('handle') : setPanelIndex(0))}
            aria-pressed={panelIndex === index}
            className={`min-h-11 px-3.5 rounded-full text-xs font-bold transition-colors ${
              panelIndex === index ? 'bg-white text-gray-900' : 'text-white hover:bg-white/15'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
})
