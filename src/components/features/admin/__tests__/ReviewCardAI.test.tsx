import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ReviewCardAI, { type ReviewPost } from '../ReviewCardAI'

function makePost(overrides: Partial<ReviewPost> = {}): ReviewPost {
  return {
    id: 'post-1',
    species: 'american',
    info_type: 'sighting',
    municipality: '秋田市',
    created_at: '2026-05-12T00:00:00Z',
    photos: ['https://example.com/photo.jpg'],
    ai_failure_count: 1,
    ai_result: {
      error: 'failed',
      error_kind: 'image_fetch',
      error_message_truncated: '画像の取得に失敗しました (404)',
      error_created_at: '2026-05-12T01:02:03Z',
      error_function_name: 'analyze-image',
      error_model: 'gemini-2.5-flash-lite',
      error_latency_ms: 1234,
    },
    ...overrides,
  }
}

describe('ReviewCardAI', () => {
  it('error_kind=image_fetch で画像取得失敗を表示する', () => {
    render(<ReviewCardAI post={makePost()} onReanalyze={vi.fn()} />)
    expect(screen.getByText('📷 画像取得失敗（再判定で復旧可能性あり）')).toHaveClass('text-amber-600')
  })

  it('error_kind=gemini_api で AI API エラーを表示する', () => {
    render(
      <ReviewCardAI
        post={makePost({ ai_result: { error: 'failed', error_kind: 'gemini_api' } })}
        onReanalyze={vi.fn()}
      />,
    )
    expect(screen.getByText('⚠️ AI API エラー（再判定または時間を置いて再試行）')).toHaveClass('text-amber-600')
  })

  it('error_kind=json_parse で分析拒否と赤系カラーを表示する', () => {
    render(
      <ReviewCardAI
        post={makePost({ ai_result: { error: 'failed', error_kind: 'json_parse' } })}
        onReanalyze={vi.fn()}
      />,
    )
    expect(screen.getByText('🚫 AI が分析を拒否（手動審査推奨）')).toHaveClass('text-red-600')
  })

  it('折りたたみ展開で生エラー詳細の冒頭を表示する', async () => {
    const user = userEvent.setup()
    render(<ReviewCardAI post={makePost()} onReanalyze={vi.fn()} />)

    await user.click(screen.getByText('エラー詳細'))

    expect(screen.getByText('画像の取得に失敗しました (404)')).toBeInTheDocument()
    expect(screen.getByText('analyze-image')).toBeInTheDocument()
    expect(screen.getByText('gemini-2.5-flash-lite')).toBeInTheDocument()
    expect(screen.getByText('1234ms')).toBeInTheDocument()
  })

  it('ai_failure_count >= 3 で再判定ボタンが disabled になる', () => {
    render(<ReviewCardAI post={makePost({ ai_failure_count: 3 })} onReanalyze={vi.fn()} />)

    const button = screen.getByRole('button', { name: '再判定する' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('title', '連続 3 回失敗のため要手動審査')
  })

  // REQ-126 FR-126-05 / AC-126-03
  it('error_kind=gemini_auth で API キー設定エラーを赤系濃色で表示する', () => {
    render(
      <ReviewCardAI
        post={makePost({ ai_result: { error: 'failed', error_kind: 'gemini_auth' } })}
        onReanalyze={vi.fn()}
      />,
    )
    const heading = screen.getByText('🔑 API キー設定エラー（管理者対応が必要）')
    expect(heading).toHaveClass('text-red-700')
    expect(heading).toHaveClass('font-semibold')
    expect(
      screen.getByText('再判定では復旧しません。GEMINI_API_KEY のローテーションが必要です'),
    ).toBeInTheDocument()
  })

  // REQ-126 FR-126-04 / AC-126-03
  it('error_kind=gemini_auth で再判定ボタンが disabled かつ runbook 誘導ツールチップ', () => {
    render(
      <ReviewCardAI
        post={makePost({ ai_result: { error: 'failed', error_kind: 'gemini_auth' } })}
        onReanalyze={vi.fn()}
      />,
    )
    const button = screen.getByRole('button', { name: '再判定する' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute(
      'title',
      'API キー設定エラーのため再判定不可。docs/runbooks/gemini-key-rotation.md を参照',
    )
  })

  // REQ-126: 一時障害は引き続き再判定可能（auth と区別する）
  it('error_kind=gemini_transient では再判定ボタンが有効', () => {
    render(
      <ReviewCardAI
        post={makePost({
          ai_failure_count: 0,
          ai_result: { error: 'failed', error_kind: 'gemini_transient' },
        })}
        onReanalyze={vi.fn()}
      />,
    )
    const button = screen.getByRole('button', { name: '再判定する' })
    expect(button).not.toBeDisabled()
    expect(
      screen.getByText('⚠️ AI API 一時障害（時間を置いて再判定）'),
    ).toBeInTheDocument()
  })

  // REQ-127 FR-127-15 / AC-127-06
  it('error_kind=gemini_truncated で切断メッセージを amber 色で表示し、再判定ボタンは有効', () => {
    render(
      <ReviewCardAI
        post={makePost({
          ai_failure_count: 0,
          ai_result: { error: 'failed', error_kind: 'gemini_truncated' },
        })}
        onReanalyze={vi.fn()}
      />,
    )
    const heading = screen.getByText('✂️ AI レスポンスが切れました（自動 retry 後も失敗）')
    expect(heading).toHaveClass('text-amber-700')
    expect(
      screen.getByText('写真を 1 枚に減らすか、別の角度で再投稿を依頼してください'),
    ).toBeInTheDocument()

    const button = screen.getByRole('button', { name: '再判定する' })
    expect(button).not.toBeDisabled()
    expect(button).toHaveAttribute(
      'title',
      '自動 retry 済み。同じ写真では同じ結果になる可能性が高い',
    )
  })

  // REQ-127 FR-127-15 / AC-127-07
  it('error_kind=gemini_safety で分析拒否を赤系濃色で表示し、再判定ボタンは disabled', () => {
    render(
      <ReviewCardAI
        post={makePost({
          ai_failure_count: 0,
          ai_result: { error: 'failed', error_kind: 'gemini_safety' },
        })}
        onReanalyze={vi.fn()}
      />,
    )
    const heading = screen.getByText('🛡️ AI が分析を拒否（safety filter）')
    expect(heading).toHaveClass('text-red-700')
    expect(heading).toHaveClass('font-semibold')
    expect(
      screen.getByText('画像が AI のポリシー違反と判定されました。手動審査を推奨します'),
    ).toBeInTheDocument()

    const button = screen.getByRole('button', { name: '再判定する' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute(
      'title',
      'safety filter のため再判定不可。手動審査が必要です',
    )
  })
})
