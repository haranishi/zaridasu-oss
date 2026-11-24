'use client'

import { useState } from 'react'
import type { AIErrorFields, AIErrorKind, AIResult } from '@/types/post'

const DETECTED_SPECIES_LABEL: Record<string, string> = { american: 'アメリカザリガニ', bullfrog: 'ウシガエル', other: 'その他', unclear: '不明' }
const QUALITY_LABEL: Record<string, string> = { good: '鮮明', acceptable: '普通', poor: '不鮮明' }

export interface ReviewPost {
  id: string
  species: string
  info_type: string
  municipality?: string | null
  created_at: string
  comment?: string | null
  count?: number | null
  observed_at?: string | null
  weather?: string | null
  temperature?: number | null
  humidity?: number | null
  lat?: number | null
  lng?: number | null
  photos?: string[] | null
  audio_url?: string | null
  is_anonymous?: boolean
  ai_result?: AIResult | null
  ai_failure_count?: number | null
}

interface ReviewCardAIProps {
  post: ReviewPost
  onReanalyze?: (post: ReviewPost) => Promise<void>
}

export default function ReviewCardAI({ post, onReanalyze }: ReviewCardAIProps) {
  const [reanalyzing, setReanalyzing] = useState(false)
  const hasPhotos = !!post.photos?.length
  const hasAudio = !!post.audio_url
  if (!hasPhotos && !hasAudio) {
    return <p className="text-sm text-gray-400">AI判定対象なし</p>
  }

  const ai = post.ai_result

  if (!ai) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <span className="animate-spin inline-block w-4 h-4 border-2 border-gray-300 border-t-gray-500 rounded-full" />
        AI判定中…
      </div>
    )
  }

  const image = ai.image_analysis ?? (hasPhotos ? ai : null)
  const audio = ai.audio_analysis
  const combined = ai.combined_decision

  async function handleReanalyze() {
    if (!onReanalyze || reanalyzing || isReanalysisSuppressed(post)) return
    setReanalyzing(true)
    try {
      await onReanalyze(post)
    } finally {
      setReanalyzing(false)
    }
  }

  const renderReanalysisButton = (errorKind?: AIErrorKind) => {
    if (!onReanalyze) return null
    const suppressed = isReanalysisSuppressed(post)
    // REQ-126 FR-126-04: 設定エラー（gemini_auth）は再判定では復旧しないため disabled。
    const authBlocked = errorKind === 'gemini_auth'
    // REQ-127 FR-127-10: safety filter は確定的に再判定しても結果が変わらないため disabled。
    const safetyBlocked = errorKind === 'gemini_safety'
    // REQ-127 FR-127-10: gemini_truncated は自動 retry 済みなので連打抑制の警告のみ（disabled にはしない）。
    const truncatedWarn = errorKind === 'gemini_truncated'
    const disabled = reanalyzing || suppressed || authBlocked || safetyBlocked
    const title = authBlocked
      ? 'API キー設定エラーのため再判定不可。docs/runbooks/gemini-key-rotation.md を参照'
      : safetyBlocked
        ? 'safety filter のため再判定不可。手動審査が必要です'
        : suppressed
          ? '連続 3 回失敗のため要手動審査'
          : truncatedWarn
            ? '自動 retry 済み。同じ写真では同じ結果になる可能性が高い'
            : undefined
    return (
      <button
        type="button"
        onClick={handleReanalyze}
        disabled={disabled}
        title={title}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-400"
      >
        <span className={`text-sm leading-none ${reanalyzing ? 'animate-spin' : ''}`} aria-hidden="true">↻</span>
        {reanalyzing ? '再判定中…' : '再判定する'}
      </button>
    )
  }

  const renderError = (analysis: AIErrorFields, label: string) => {
    const presentation = getErrorPresentation(analysis.error_kind, label)
    return (
      <div className="space-y-2">
        <p className={`text-sm font-semibold ${presentation.className}`}>{presentation.text}</p>
        {presentation.subText && (
          <p className="text-xs text-red-600">{presentation.subText}</p>
        )}
        <details className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600">
          <summary className="cursor-pointer font-medium text-gray-500">エラー詳細</summary>
          <div className="mt-2 space-y-1.5">
            <DetailRow label="発生時刻" value={formatDateTime(analysis.error_created_at)} />
            <DetailRow label="Function" value={analysis.error_function_name ?? '—'} />
            <DetailRow label="Model" value={analysis.error_model ?? '—'} />
            <DetailRow label="Latency" value={analysis.error_latency_ms != null ? `${analysis.error_latency_ms}ms` : '—'} />
            <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap wrap-break-word rounded-sm bg-gray-50 p-2 text-[11px] leading-relaxed text-gray-600">
              {truncateError(analysis.error_message_truncated ?? analysis.error ?? '詳細不明')}
            </pre>
          </div>
        </details>
        {renderReanalysisButton(analysis.error_kind)}
      </div>
    )
  }

  const renderAnalysis = (label: string, a: AIResult | null | undefined, icon: string) => {
    if (!a) return null
    if (a.error) return renderError(a, label)
    const conf = a.confidence != null ? Math.round(a.confidence * 100) : null
    const match = a.species_match === true
    const mismatch = a.species_match === false
    return (
      <div className="space-y-1.5 text-sm">
        <p className="text-xs font-semibold text-gray-500">{icon} {label}判定</p>
        <Row label="検出種" value={a.detected_species ? (DETECTED_SPECIES_LABEL[a.detected_species] ?? a.detected_species) : '—'} />
        <Row
          label="申告一致"
          value={match ? '✅ 一致' : mismatch ? '❌ 不一致' : '不明'}
          cls={match ? 'text-green-600 font-semibold' : mismatch ? 'text-red-600 font-semibold' : 'text-gray-400'}
        />
        {conf != null && (
          <div className="flex items-center justify-between">
            <span className="text-gray-400">信頼度</span>
            <div className="flex items-center gap-2">
              <div className="h-2 w-20 overflow-hidden rounded-full bg-gray-200">
                <div
                  className={`h-full rounded-full transition-all ${
                    conf >= 70 ? 'bg-green-500' : conf >= 50 ? 'bg-amber-400' : 'bg-red-400'
                  }`}
                  style={{ width: `${conf}%` }}
                />
              </div>
              <span className="font-semibold tabular-nums">{conf}%</span>
            </div>
          </div>
        )}
        {a.notes && (
          <p className="rounded-sm bg-gray-50 p-1.5 text-xs leading-relaxed text-gray-500">{a.notes}</p>
        )}
      </div>
    )
  }

  if (!audio && !combined) {
    if (ai.error) {
      return (
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-sm font-bold text-gray-700">🤖 AI判定</p>
          {renderError(ai, hasPhotos ? '画像' : 'AI')}
        </div>
      )
    }

    const confidence = ai.confidence != null ? Math.round(ai.confidence * 100) : null
    const isMatch = ai.species_match === true
    const isMismatch = ai.species_match === false

    return (
      <div className="space-y-2">
        <p className="flex items-center gap-1.5 text-sm font-bold text-gray-700">🤖 AI判定</p>
        <div className="space-y-1.5 text-sm">
          <Row label="検出種" value={ai.detected_species ? (DETECTED_SPECIES_LABEL[ai.detected_species] ?? ai.detected_species) : '—'} />
          <Row
            label="申告一致"
            value={isMatch ? '✅ 一致' : isMismatch ? '❌ 不一致' : '不明'}
            cls={isMatch ? 'text-green-600 font-semibold' : isMismatch ? 'text-red-600 font-semibold' : 'text-gray-400'}
          />
          {confidence != null && (
            <div className="flex items-center justify-between">
              <span className="text-gray-400">信頼度</span>
              <div className="flex items-center gap-2">
                <div className="h-2 w-20 overflow-hidden rounded-full bg-gray-200">
                  <div
                    className={`h-full rounded-full transition-all ${
                      confidence >= 70 ? 'bg-green-500' : confidence >= 50 ? 'bg-amber-400' : 'bg-red-400'
                    }`}
                    style={{ width: `${confidence}%` }}
                  />
                </div>
                <span className="font-semibold tabular-nums">{confidence}%</span>
              </div>
            </div>
          )}
          <Row label="画質" value={ai.image_quality ? (QUALITY_LABEL[ai.image_quality] ?? ai.image_quality) : '—'} />
          {/* REQ-215 FR-215-02: tri-state（true=問題なし / false=要注意 / null=不明）。
              null（不明）を「問題なし」と誤表示せず、自動承認に進まない旨が分かるようにする。 */}
          <Row
            label="適切性"
            value={ai.is_appropriate === true ? '問題なし' : ai.is_appropriate === false ? '⚠️ 要注意' : '不明（要確認）'}
            cls={ai.is_appropriate === true ? 'text-green-600' : ai.is_appropriate === false ? 'text-red-600 font-semibold' : 'text-gray-400'}
          />
        </div>
        {ai.notes && (
          <p className="rounded-lg bg-gray-50 p-2 text-sm leading-relaxed text-gray-500">
            {ai.notes}
          </p>
        )}
        {ai.per_photo && ai.per_photo.length > 1 && (
          <div className="mt-2 border-t border-gray-100 pt-2">
            <p className="mb-1.5 text-xs font-medium text-gray-400">写真別判定 ({ai.analyzed_count}/{ai.photo_count}枚)</p>
            <div className="flex gap-2">
              {ai.per_photo.map((ph, i) => {
                const phConf = ph.confidence != null ? Math.round(ph.confidence * 100) : null
                return (
                  <div key={i} className="flex-1 rounded-lg bg-gray-50 p-1.5 text-center">
                    <p className="text-xs text-gray-400">#{i + 1}</p>
                    {ph.error ? (
                      <p className="text-xs text-red-400">失敗</p>
                    ) : (
                      <>
                        {phConf != null && (
                          <p className={`text-sm font-bold tabular-nums ${phConf >= 70 ? 'text-green-600' : phConf >= 50 ? 'text-amber-500' : 'text-red-500'}`}>
                            {phConf}%
                          </p>
                        )}
                        <p className="text-xs text-gray-400">
                          {ph.species_match === true ? '✅' : ph.species_match === false ? '❌' : '—'}
                        </p>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="flex items-center gap-1.5 text-sm font-bold text-gray-700">🤖 AI判定</p>
      {image && renderAnalysis('画像', image, '📷')}
      {audio && renderAnalysis('音声', audio, '🎤')}
      {combined?.reason && (
        <div className={`rounded border p-2 text-xs ${
          combined.reason === 'both_modalities_match' || combined.reason === 'audio_only_high_confidence'
            ? 'border-green-200 bg-green-50 text-green-700'
            : combined.reason.includes('reject') || combined.reason === 'inappropriate_content' || combined.reason === 'audio_species_mismatch'
              ? 'border-red-200 bg-red-50 text-red-700'
              : 'border-amber-200 bg-amber-50 text-amber-700'
        }`}>
          統合判定: {combined.reason}
        </div>
      )}
    </div>
  )
}

interface RowProps {
  label: string
  value: string
  cls?: string
}

function Row({ label, value, cls = '' }: RowProps) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-400">{label}</span>
      <span className={cls || 'font-medium text-gray-700'}>{value}</span>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-gray-400">{label}</span>
      <span className="text-right font-medium text-gray-700">{value}</span>
    </div>
  )
}

function getErrorPresentation(
  kind: AIErrorKind | undefined,
  label: string,
): { text: string; className: string; subText?: string } {
  switch (kind) {
    case 'image_fetch':
      return {
        text: label === '音声'
          ? '🎤 音声取得失敗（再判定で復旧可能性あり）'
          : '📷 画像取得失敗（再判定で復旧可能性あり）',
        className: 'text-amber-600',
      }
    // REQ-126 FR-126-05: 設定エラーは赤系濃色で「管理者対応が必要」と明示し、
    // 再判定では復旧しない旨をサブテキストで案内する。
    case 'gemini_auth':
      return {
        text: '🔑 API キー設定エラー（管理者対応が必要）',
        className: 'text-red-700 font-semibold',
        subText: '再判定では復旧しません。GEMINI_API_KEY のローテーションが必要です',
      }
    case 'gemini_transient':
      return {
        text: '⚠️ AI API 一時障害（時間を置いて再判定）',
        className: 'text-amber-600',
      }
    // REQ-127 FR-127-09: MAX_TOKENS で切れた場合は自動 retry 済みの上で失敗していることを示す。
    // amber 系で「リカバリ可能性あり」（写真差し替え）の文脈にする。
    case 'gemini_truncated':
      return {
        text: '✂️ AI レスポンスが切れました（自動 retry 後も失敗）',
        className: 'text-amber-700',
        subText: '写真を 1 枚に減らすか、別の角度で再投稿を依頼してください',
      }
    // REQ-127 FR-127-09: safety filter / blockReason は再判定で復旧しない確定的失敗。
    // 赤系濃色で手動審査誘導する。
    case 'gemini_safety':
      return {
        text: '🛡️ AI が分析を拒否（safety filter）',
        className: 'text-red-700 font-semibold',
        subText: '画像が AI のポリシー違反と判定されました。手動審査を推奨します',
      }
    case 'gemini_api':
      return { text: '⚠️ AI API エラー（再判定または時間を置いて再試行）', className: 'text-amber-600' }
    case 'json_parse':
      return { text: '🚫 AI が分析を拒否（手動審査推奨）', className: 'text-red-600' }
    default:
      return { text: 'AI判定失敗（詳細不明）', className: 'text-red-600' }
  }
}

function isReanalysisSuppressed(post: ReviewPost): boolean {
  return (post.ai_failure_count ?? 0) >= 3
}

function formatDateTime(value: string | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('ja-JP')
}

function truncateError(value: string): string {
  return value.length > 300 ? `${value.slice(0, 300)}...` : value
}
