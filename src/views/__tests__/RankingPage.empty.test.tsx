/**
 * REQ-320 FR-320-08: 「データが少ない状態」の見せ方の回帰テスト。
 *
 * Round 1 の採点で `ranking` は「ランキングと名乗りながら順位数字もメダルも無い 1 行」だけの
 * 画面になっていた（採点 #14）。原因は 2 つで、どちらもデータではなく**表示の設計**の問題:
 *   ① 1〜3 位はメダル絵文字が順位番号を**置き換えて**いたので、1 件しか無い立ち上がり期には
 *      画面に数字が 1 つも出なかった。
 *   ② 一覧が短いことを補う文脈も次の行動も無く、「読み込みに失敗した画面」と区別できなかった。
 * この 2 点をテストで固定する（実データが増えても壊れないよう、件数のしきい値も併せて確認する）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen } from '@testing-library/react'

const { tSpy, hooks } = vi.hoisted(() => ({
  tSpy: vi.fn((key: string) => key),
  hooks: {
    ranking: [] as unknown[],
    diversity: [] as unknown[],
  },
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: tSpy, i18n: { language: 'ja', changeLanguage: vi.fn() } }),
}))
vi.mock('@/context/ThemeContext', () => ({ useTheme: () => ({ dark: false }) }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: null }) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/hooks/useProfile', () => ({
  useRanking: () => ({ ranking: hooks.ranking, loading: false, error: null, refetch: vi.fn() }),
  useDiversity: () => ({ diversity: hooks.diversity, loading: false, error: null, refetch: vi.fn() }),
  useQuality: () => ({ quality: [], loading: false }),
}))
vi.mock('@/components/layout/Header', () => ({ default: () => <header /> }))
vi.mock('@/components/layout/BottomNav', () => ({ default: () => <nav /> }))
vi.mock('@/components/layout/Footer', () => ({ default: () => <footer /> }))
vi.mock('@/components/features/home/PriorityAreaNudge', () => ({ default: () => null }))

import RankingPage from '../RankingPage'

function entry(rank: number) {
  return {
    user_id: `u${rank}`,
    display_name: `調査員${rank}`,
    avatar_emoji: '🦞',
    rank,
    post_count: 10 - rank,
  }
}

beforeEach(() => {
  hooks.ranking = []
  hooks.diversity = []
  tSpy.mockClear()
})

describe('REQ-320 FR-320-08: ランキングの空状態', () => {
  it('1 件しか無くても順位番号を出す（メダルが数字を置き換えない）', async () => {
    hooks.ranking = [entry(1)]
    const { default: userEvent } = await import('@testing-library/user-event')
    render(<RankingPage />)

    // 投稿数ランキング（オプトイン）タブへ切り替える
    await userEvent.click(screen.getByRole('tab', { name: /ranking\.tabLeaderboard/ }))

    // 数字の「1」が画面に出ている（旧実装は 🥇 だけで数字が無かった）
    expect(screen.getByText('1')).toBeInTheDocument()
    // 読み上げ用の順位語も添える
    expect(tSpy).toHaveBeenCalledWith('ranking.rankPosition', { rank: 1 })
  })

  it('一覧が短いときは「まだ少ない」注記と投稿導線を出す', () => {
    hooks.diversity = [{ user_id: 'u1', display_name: '調査員1', avatar_emoji: '🦞', info_type_coverage: 1, municipality_count: 1, species_count: 2 }]
    render(<RankingPage />)
    expect(screen.getByText('ranking.earlyStageNote')).toBeInTheDocument()
    expect(tSpy).toHaveBeenCalledWith('ranking.earlyStageNote', { count: 1 })
  })

  it('一覧が育ったら注記は消える（データは偽らず、出し分けだけで見せる）', () => {
    hooks.diversity = Array.from({ length: 6 }, (_, i) => ({
      user_id: `u${i}`, display_name: `調査員${i}`, avatar_emoji: '🦞',
      info_type_coverage: 1, municipality_count: 1, species_count: 2,
    }))
    render(<RankingPage />)
    expect(screen.queryByText('ranking.earlyStageNote')).not.toBeInTheDocument()
  })
})
