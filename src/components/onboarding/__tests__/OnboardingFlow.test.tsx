import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import OnboardingFlow from '../OnboardingFlow'
import { completeOnboarding } from '@/lib/onboarding/complete'
import { INTRO_READ_AT_KEY, resetIntroOverlayForTest } from '@/lib/introStorage'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/context/ThemeContext'
import { SPECIES } from '@/lib/constants'

const { getUser, upsert } = vi.hoisted(() => ({ getUser: vi.fn(), upsert: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({ supabase: { auth: { getUser }, from: () => ({ upsert }) } }))
vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }))

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@/context/ThemeContext', () => ({ useTheme: vi.fn(() => ({ dark: false })) }))
vi.mock('@/context/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('@/lib/onboarding/complete', () => ({ completeOnboarding: vi.fn() }))
vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}))

function next() { fireEvent.click(screen.getByTestId('onboarding-continue')) }
function advanceTo(target: number, seen = 'yes') {
  if (target >= 2) { fireEvent.click(screen.getByTestId('onboarding-option-north')); next() }
  if (target >= 3) { fireEvent.click(screen.getByTestId(`onboarding-option-${seen}`)); next() }
  if (target >= 4) next()
}

const userCreatedAt = (msAgo: number) =>
  ({ user: { id: 'user-1', created_at: new Date(Date.now() - msAgo).toISOString() } }) as unknown as ReturnType<typeof useAuth>

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useAuth).mockReturnValue(userCreatedAt(365 * 24 * 60 * 60 * 1000))
  vi.mocked(completeOnboarding).mockResolvedValue(undefined)
  localStorage.clear()
  resetIntroOverlayForTest()
})

describe('OnboardingFlow', () => {
  it('選択肢カードと全副ボタンはライト・ダークとも押せる枠線を使う', async () => {
    for (const dark of [false, true]) {
      vi.mocked(useTheme).mockReturnValue({ dark } as ReturnType<typeof useTheme>)
      const assertBorder = (element: HTMLElement) => {
        expect(element).toHaveClass(dark ? 'border-slate-400' : 'border-gray-500')
        expect(element).toHaveClass(dark ? 'bg-slate-800' : 'bg-white')
        expect(element).not.toHaveClass('border-gray-200')
        expect(element).not.toHaveClass('border-slate-600')
      }
      const view = render(<OnboardingFlow mode="optional" onClose={vi.fn()} />)
      screen.getAllByTestId(/^onboarding-option-/).forEach(assertBorder)
      assertBorder(screen.getByTestId('onboarding-map-only'))
      advanceTo(2)
      screen.getAllByTestId(/^onboarding-option-/).forEach(assertBorder)
      view.unmount()

      vi.mocked(completeOnboarding).mockRejectedValue(new Error('offline'))
      const required = render(<OnboardingFlow mode="required" onClose={vi.fn()} />)
      assertBorder(screen.getByTestId('onboarding-skip'))
      advanceTo(4)
      assertBorder(screen.getByTestId('onboarding-map-only'))
      fireEvent.click(screen.getByTestId('onboarding-post'))
      await screen.findByRole('alert')
      fireEvent.click(screen.getByTestId('onboarding-post'))
      assertBorder(await screen.findByTestId('onboarding-later'))
      required.unmount()
    }
    vi.mocked(useTheme).mockReturnValue({ dark: false } as ReturnType<typeof useTheme>)
  })
  it('進捗は全4画面で、最後の画面に「つづける」は出ない', () => {
    render(<OnboardingFlow mode="optional" onClose={vi.fn()} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '4')
    expect(screen.getByText('1 / 4')).toBeInTheDocument()
    advanceTo(4)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '4')
    expect(screen.getByText('4 / 4')).toBeInTheDocument()
    expect(screen.queryByTestId('onboarding-continue')).not.toBeInTheDocument()
    expect(screen.getByTestId('onboarding-post')).toBeInTheDocument()
  })
  // REQ-327: 挨拶だけの画面をやめて地域の質問に載せた。挨拶・所要・質問・選択肢が
  // 1 画面目に同居していることを固定する（どれかが落ちると 5 画面に戻した意味が消える）。
  it('1画面目に挨拶と所要と地域の質問が同居し、2画面目には挨拶が残らない', () => {
    render(<OnboardingFlow mode="optional" onClose={vi.fn()} />)
    expect(screen.getByText('onboarding.greet.bubble')).toBeInTheDocument()
    expect(screen.getByText('onboarding.greet.effort')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('onboarding.askRegion.q')
    expect(screen.getByTestId('onboarding-option-north')).toBeInTheDocument()
    advanceTo(2)
    expect(screen.queryByText('onboarding.greet.bubble')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('onboarding.askSeen.q')
  })
  it('完了画面のピンはSPECIESのアメリカザリガニ色で、模式図にクラスタの赤は出ない', () => {
    render(<OnboardingFlow mode="optional" onClose={vi.fn()} />)
    advanceTo(4)
    const diagram = screen.getByTestId('onboarding-step').querySelector('svg')
    expect(diagram).toBeInTheDocument()
    expect(diagram).toHaveAttribute('viewBox', '0 0 400 160')
    const color = SPECIES.find(s => s.value === 'american')?.color
    expect(color).toBeDefined()
    // REQ-327: 池 3 つに対してピンは 3 本（2 本は同じ池＝「1件＝1点」、1 つの池は点が無いまま）。
    // 点の無い池は「空いているところは、まだだれも調べていない」という吹き出しの裏づけなので消さない。
    expect(diagram!.querySelectorAll('ellipse')).toHaveLength(3)
    const pins = diagram!.querySelectorAll('g > path')
    expect(pins).toHaveLength(3)
    pins.forEach(pin => {
      expect(pin).toHaveAttribute('fill', color)
      expect(pin).toHaveAttribute('stroke', 'white')
    })
    expect(diagram!.outerHTML).not.toContain('#dc2626')
  })
  it('4画面を順に進み、質問は選択するまで進めない', () => {
    render(<OnboardingFlow mode="optional" onClose={vi.fn()} />)
    for (let step = 1; step <= 4; step++) {
      expect(screen.getByTestId('onboarding-step')).toHaveAttribute('data-step', String(step))
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', String(step))
      if (step === 1 || step === 2) {
        expect(screen.getByTestId('onboarding-continue')).toBeDisabled()
        expect(screen.getByText(step === 1 ? 'onboarding.selectionHint.region' : 'onboarding.selectionHint.seen')).toBeInTheDocument()
        next()
        expect(screen.getByTestId('onboarding-step')).toHaveAttribute('data-step', String(step))
        const option = screen.getByTestId(step === 1 ? 'onboarding-option-north' : 'onboarding-option-yes')
        fireEvent.click(option)
        expect(option).toHaveAttribute('aria-pressed', 'true')
        expect(screen.getByTestId('onboarding-continue')).toBeEnabled()
      }
      if (step < 4) next()
    }
  })
  // REQ-325 で「白文字×淡赤 2.32:1 → 灰色の面＋濃灰の文字（約6.1:1）」にした。
  // REQ-326 でダークだけ明度が反転していると分かったので（無効の地 L=244 が有効時の赤 L=88 より
  // 明るく、押せないものが画面で最も明るい大面積要素になっていた）、暗い地＋明るい文字へ入れ替えた。
  // コントラストは落としていない。半透明で沈める方式へは戻さないこと（それが 2.32:1 の原因だった）。
  it.each([1, 2])('画面%d: 無効CTAは不透明な面で、押せる主ボタンより明るくしない', (step) => {
    render(<OnboardingFlow mode="optional" onClose={vi.fn()} />)
    advanceTo(step)
    const button = screen.getByTestId('onboarding-continue')
    expect(button).toBeDisabled()
    expect(button).toHaveClass('disabled:bg-gray-200!', 'disabled:text-gray-600!', 'disabled:opacity-100!', 'disabled:shadow-none')
    fireEvent.click(screen.getByTestId(step === 1 ? 'onboarding-option-north' : 'onboarding-option-yes'))
    expect(button).toBeEnabled()
  })
  it.each([1, 2])('画面%d: 選択したカードだけにチェックとaria-pressedを付け、選び直せる', (step) => {
    render(<OnboardingFlow mode="optional" onClose={vi.fn()} />)
    advanceTo(step)
    const options = screen.getAllByTestId(/^onboarding-option-/)
    const assertSelection = (selectedIndex: number) => {
      options.forEach((option, index) => {
        expect(option).toHaveAttribute('aria-pressed', String(index === selectedIndex))
        const check = option.querySelector('svg.lucide-check')
        if (index === selectedIndex) {
          expect(check).toBeInTheDocument()
          expect(check).toHaveAttribute('aria-hidden', 'true')
          expect(option).toHaveClass('border-blue-600', 'bg-blue-50')
        } else expect(check).toBeNull()
      })
    }
    assertSelection(-1)
    fireEvent.click(options[0]!)
    assertSelection(0)
    fireEvent.click(options[1]!)
    assertSelection(1)
  })
  it('戻って回答を訂正し、最新の地域と目撃経験だけを保存する', async () => {
    render(<OnboardingFlow mode="required" onClose={vi.fn()} />)
    advanceTo(4)

    fireEvent.click(screen.getByTestId('onboarding-back'))
    expect(screen.getByTestId('onboarding-step')).toHaveAttribute('data-step', '3')
    fireEvent.click(screen.getByTestId('onboarding-back'))
    expect(screen.getByTestId('onboarding-option-yes')).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByTestId('onboarding-option-maybe'))
    fireEvent.click(screen.getByTestId('onboarding-back'))
    expect(screen.getByTestId('onboarding-option-north')).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByTestId('onboarding-option-south'))

    next()
    next()
    next()
    fireEvent.click(screen.getByTestId('onboarding-map-only'))
    await waitFor(() => expect(completeOnboarding).toHaveBeenCalledExactlyOnceWith({ region: 'south', seen: 'maybe', mode: 'required' }))
  })
  it('画面遷移と後退のたびに本文を先頭へ戻し、新しい見出しへフォーカスする', () => {
    render(<OnboardingFlow mode="required" onClose={vi.fn()} />)
    const content = screen.getByTestId('onboarding-step')
    expect(screen.getByRole('heading', { level: 2 })).toHaveFocus()
    content.scrollTop = 120
    fireEvent.click(screen.getByTestId('onboarding-option-north'))
    next()
    expect(content).toHaveAttribute('data-step', '2')
    expect(content.scrollTop).toBe(0)
    expect(screen.getByRole('heading', { level: 2 })).toHaveFocus()
    fireEvent.click(screen.getByTestId('onboarding-back'))
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('onboarding.askRegion.q')
    expect(screen.getByRole('heading', { level: 2 })).toHaveFocus()
  })
  it('必須の1画面目で見出しからShift+Tabしてもダイアログ外へ出ない', () => {
    vi.mocked(useAuth).mockReturnValue(userCreatedAt(5 * 60 * 1000))
    render(<OnboardingFlow mode="required" onClose={vi.fn()} />)
    const heading = screen.getByRole('heading', { level: 2 })
    expect(heading).toHaveFocus()
    fireEvent.keyDown(heading, { key: 'Tab', shiftKey: true })
    expect(screen.getByTestId('onboarding-option-other')).toHaveFocus()
  })
  it.each([1, 2, 3, 4])('optional: 画面%dの×で閉じて読了を保存する', (step) => {
    const close = vi.fn()
    render(<OnboardingFlow mode="optional" onClose={close} />)
    advanceTo(step)
    fireEvent.click(screen.getByTestId('onboarding-close'))
    expect(close).toHaveBeenCalledOnce()
    expect(localStorage.getItem(INTRO_READ_AT_KEY)).not.toBeNull()
  })
  it('optional: 画面1のmapOnlyとEscで閉じられる', () => {
    const close = vi.fn()
    render(<OnboardingFlow mode="optional" onClose={close} />)
    fireEvent.click(screen.getByTestId('onboarding-map-only'))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(close).toHaveBeenCalledTimes(2)
  })
  it('optional: 画面1の地図ボタンは回答を保存せず、地図コールバックだけを呼ぶ', () => {
    const close = vi.fn(), post = vi.fn(), map = vi.fn()
    render(<OnboardingFlow mode="optional" onClose={close} onPostClick={post} onMapClick={map} />)
    fireEvent.click(screen.getByTestId('onboarding-map-only'))
    expect(close).toHaveBeenCalledOnce()
    expect(map).toHaveBeenCalledOnce()
    expect(post).not.toHaveBeenCalled()
    expect(completeOnboarding).not.toHaveBeenCalled()
    expect(localStorage.getItem('zaridasu_onboarding_region_v1')).toBeNull()
  })
  it.each(['onboarding-map-only', 'onboarding-post'])('optional: %sで地域と読了を保存する', async (button) => {
    const close = vi.fn(), post = vi.fn(), map = vi.fn()
    render(<OnboardingFlow mode="optional" onClose={close} onPostClick={post} onMapClick={map} />)
    advanceTo(4)
    fireEvent.click(screen.getByTestId(button))
    await waitFor(() => expect(close).toHaveBeenCalledOnce())
    expect(localStorage.getItem('zaridasu_onboarding_region_v1')).toBe('north')
    expect(localStorage.getItem(INTRO_READ_AT_KEY)).not.toBeNull()
    expect(completeOnboarding).not.toHaveBeenCalled()
    expect(post).toHaveBeenCalledTimes(button === 'onboarding-post' ? 1 : 0)
    expect(map).toHaveBeenCalledTimes(button === 'onboarding-map-only' ? 1 : 0)
  })
  it('required: 全画面で×が無く、画面1〜3にはmapOnlyも無く、Escも閉じない', () => {
    const close = vi.fn()
    render(<OnboardingFlow mode="required" onClose={close} />)
    for (let step = 1; step <= 4; step++) {
      expect(screen.queryByTestId('onboarding-close')).not.toBeInTheDocument()
      // 画面4の「まずは見るだけ」は抜け道ではなく「保存して閉じる」なので required でも出す（REQ-325 画面表）
      if (step < 4) expect(screen.queryByTestId('onboarding-map-only')).not.toBeInTheDocument()
      else expect(screen.getByTestId('onboarding-map-only')).toBeInTheDocument()
      fireEvent.keyDown(document, { key: 'Escape' })
      if (step === 1) fireEvent.click(screen.getByTestId('onboarding-option-other'))
      if (step === 2) fireEvent.click(screen.getByTestId('onboarding-option-no'))
      if (step < 4) next()
    }
    expect(close).not.toHaveBeenCalled()
  })
  it('required: 画面4の「まずは見るだけ」は保存してから閉じ、投稿には進まない', async () => {
    vi.mocked(completeOnboarding).mockResolvedValue(undefined)
    const close = vi.fn(), post = vi.fn(), map = vi.fn()
    render(<OnboardingFlow mode="required" onClose={close} onPostClick={post} onMapClick={map} />)
    advanceTo(4)
    fireEvent.click(screen.getByTestId('onboarding-map-only'))
    await waitFor(() => { expect(close).toHaveBeenCalledTimes(1) })
    expect(completeOnboarding).toHaveBeenCalledExactlyOnceWith({ region: 'north', seen: 'yes', mode: 'required' })
    expect(post).not.toHaveBeenCalled()
    expect(map).toHaveBeenCalledOnce()
  })
  it('required: 保存成功後に閉じて投稿へ進む。連打しても一度だけ保存', async () => {
    let resolve!: () => void
    vi.mocked(completeOnboarding).mockReturnValue(new Promise<void>(r => { resolve = r }))
    const close = vi.fn(), post = vi.fn()
    render(<OnboardingFlow mode="required" onClose={close} onPostClick={post} />)
    advanceTo(4)
    screen.getByTestId('onboarding-post').focus()
    fireEvent.click(screen.getByTestId('onboarding-post'))
    fireEvent.click(screen.getByTestId('onboarding-post'))
    expect(completeOnboarding).toHaveBeenCalledExactlyOnceWith({ region: 'north', seen: 'yes', mode: 'required' })
    expect(close).not.toHaveBeenCalled()
    expect(screen.getByTestId('onboarding-post')).toHaveTextContent('onboarding.saving')
    expect(screen.getByTestId('onboarding-back')).toBeDisabled()
    expect(screen.getByTestId('onboarding-post')).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('heading', { level: 2 })).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('heading', { level: 2 }), { key: 'Tab' })
    expect(screen.getByRole('heading', { level: 2 })).toHaveFocus()
    resolve()
    await waitFor(() => expect(close).toHaveBeenCalledOnce())
    expect(post).toHaveBeenCalledOnce()
  })
  it('地図保存の失敗後は地図ボタンだけが再試行になり、成功しても投稿へ進まない', async () => {
    vi.mocked(completeOnboarding)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(undefined)
    const close = vi.fn(), post = vi.fn(), map = vi.fn()
    render(<OnboardingFlow mode="required" onClose={close} onPostClick={post} onMapClick={map} />)
    advanceTo(4)

    fireEvent.click(screen.getByTestId('onboarding-map-only'))
    await screen.findByRole('alert')
    expect(screen.getByTestId('onboarding-map-only')).toHaveTextContent('onboarding.error.retry')
    expect(screen.getByTestId('onboarding-post')).toHaveTextContent('intro.cta.post')
    fireEvent.click(screen.getByTestId('onboarding-map-only'))

    await waitFor(() => expect(close).toHaveBeenCalledOnce())
    expect(completeOnboarding).toHaveBeenCalledTimes(2)
    expect(map).toHaveBeenCalledOnce()
    expect(post).not.toHaveBeenCalled()
  })
  it('required: 保存失敗2回であとでを出し、未完了のまま閉じる', async () => {
    vi.mocked(completeOnboarding).mockRejectedValue(new Error('offline'))
    const close = vi.fn()
    render(<OnboardingFlow mode="required" onClose={close} />)
    advanceTo(4)
    fireEvent.click(screen.getByTestId('onboarding-post'))
    await screen.findByRole('alert')
    expect(screen.getByTestId('onboarding-post')).toHaveTextContent('onboarding.error.retry')
    expect(screen.queryByTestId('onboarding-later')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('onboarding-post'))
    fireEvent.click(await screen.findByTestId('onboarding-later'))
    expect(close).toHaveBeenCalledOnce()
    expect(localStorage.getItem(INTRO_READ_AT_KEY)).toBeNull()
  })
  it.each(['yes', 'no', 'maybe'])('画面3の一言は%sに合わせ、出典と法令は既存キーを使う', (seen) => {
    render(<OnboardingFlow mode="optional" onClose={vi.fn()} />)
    advanceTo(3, seen)
    expect(screen.getByText(seen === 'yes' ? 'onboarding.fact.seenYes' : 'onboarding.fact.seenNo')).toBeInTheDocument()
    for (const key of ['quote', 'quoteSource', 'quoteLink']) expect(screen.getByText(`intro.slides.2.${key}`)).toBeInTheDocument()
    next()
    expect(screen.getByText('intro.slides.5.body')).toBeInTheDocument()
  })
})

afterEach(() => vi.useRealTimers())

it('required: 保存保留の期限後にもう一度、再度の期限後にあとでを出して閉じられる', async () => {
  const actual = await vi.importActual<typeof import('@/lib/onboarding/complete')>('@/lib/onboarding/complete')
  vi.useFakeTimers()
  vi.mocked(completeOnboarding).mockImplementation(actual.completeOnboarding)
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
  upsert.mockReturnValue(new Promise(() => {}))
  const close = vi.fn()
  render(<OnboardingFlow mode="required" onClose={close} />)
  advanceTo(4)
  fireEvent.click(screen.getByTestId('onboarding-post'))
  expect(screen.getByTestId('onboarding-post')).toBeDisabled()
  await act(async () => vi.advanceTimersByTimeAsync(actual.ONBOARDING_SAVE_TIMEOUT_MS))
  expect(screen.getByTestId('onboarding-post')).toHaveTextContent('onboarding.error.retry')
  expect(screen.getByTestId('onboarding-post')).toBeEnabled()
  expect(screen.queryByTestId('onboarding-later')).not.toBeInTheDocument()
  fireEvent.click(screen.getByTestId('onboarding-post'))
  expect(screen.getByTestId('onboarding-post')).toBeDisabled()
  await act(async () => vi.advanceTimersByTimeAsync(actual.ONBOARDING_SAVE_TIMEOUT_MS))
  expect(screen.getByTestId('onboarding-later')).toBeEnabled()
  expect(close).not.toHaveBeenCalled()
  fireEvent.click(screen.getByTestId('onboarding-later'))
  expect(close).toHaveBeenCalledOnce()
  expect(localStorage.getItem(INTRO_READ_AT_KEY)).toBeNull()
})

// REQ-326: 既存会員を入口で止めない。新規登録直後は必須のまま。
describe('REQ-326 既存会員のスキップ', () => {
  it('既存会員には1〜3画面目にスキップが出て、4画面目には出ない', () => {
    vi.mocked(useAuth).mockReturnValue(userCreatedAt(24 * 60 * 60 * 1000)) // 1日前に登録
    render(<OnboardingFlow mode="required" onClose={vi.fn()} />)
    for (let step = 1; step <= 3; step++) {
      expect(screen.getByTestId('onboarding-step')).toHaveAttribute('data-step', String(step))
      expect(screen.getByTestId('onboarding-skip')).toBeInTheDocument()
      if (step === 1) fireEvent.click(screen.getByTestId('onboarding-option-north'))
      if (step === 2) fireEvent.click(screen.getByTestId('onboarding-option-yes'))
      next()
    }
    expect(screen.getByTestId('onboarding-step')).toHaveAttribute('data-step', '4')
    expect(screen.queryByTestId('onboarding-skip')).not.toBeInTheDocument()
  })

  it('登録直後にはスキップを出さない（必須のまま）', () => {
    vi.mocked(useAuth).mockReturnValue(userCreatedAt(5 * 60 * 1000)) // 5分前に登録
    render(<OnboardingFlow mode="required" onClose={vi.fn()} />)
    expect(screen.queryByTestId('onboarding-skip')).not.toBeInTheDocument()
  })

  it('未ログイン（optional）にはスキップを出さない（×と「まずは見るだけ」が既にある）', () => {
    render(<OnboardingFlow mode="optional" onClose={vi.fn()} />)
    expect(screen.queryByTestId('onboarding-skip')).not.toBeInTheDocument()
    expect(screen.getByTestId('onboarding-close')).toBeInTheDocument()
  })

  it('スキップは行を作らずに閉じる（次回また出る）', () => {
    const onClose = vi.fn()
    render(<OnboardingFlow mode="required" onClose={onClose} />)
    fireEvent.click(screen.getByTestId('onboarding-skip'))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(completeOnboarding).not.toHaveBeenCalled()
  })
})

// REQ-326: 保存先の説明を実態に合わせる。
describe('REQ-326 保存先の説明', () => {
  it('未ログインでは「この端末に保存」と説明する', () => {
    render(<OnboardingFlow mode="optional" onClose={vi.fn()} />)
    advanceTo(1)
    expect(screen.getByText('onboarding.askRegion.consentLocal')).toBeInTheDocument()
  })

  it('ログイン時は従来どおりプロフィールに保存と説明する', () => {
    render(<OnboardingFlow mode="required" onClose={vi.fn()} />)
    advanceTo(1)
    expect(screen.getByText('onboarding.askRegion.consent')).toBeInTheDocument()
  })
})

// REQ-326: ダークだけ無効 CTA の明度が反転していた（無効の地が有効時の赤より明るく、
// 押せないものが画面で最も明るい大面積要素になる）。暗い地＋明るい文字へ入れ替えた。
it('ダークでは無効CTAを暗い面＋明るい文字にする（明るい面にしない）', () => {
  vi.mocked(useTheme).mockReturnValue({ dark: true } as ReturnType<typeof useTheme>)
  render(<OnboardingFlow mode="optional" onClose={vi.fn()} />)
  advanceTo(1)
  const button = screen.getByTestId('onboarding-continue')
  expect(button).toBeDisabled()
  expect(button).toHaveClass('disabled:bg-slate-700!', 'disabled:text-slate-300!')
  expect(button).not.toHaveClass('disabled:bg-gray-200!')
  vi.mocked(useTheme).mockReturnValue({ dark: false } as ReturnType<typeof useTheme>)
})
