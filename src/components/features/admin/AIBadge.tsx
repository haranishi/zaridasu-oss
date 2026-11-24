'use client'

import { useState, useEffect, useRef } from 'react'
import type { AdminPost } from '@/types/post'

const DETECTED_SPECIES_LABEL: Record<string, string> = {
  american: 'アメリカザリガニ',
  bullfrog: 'ウシガエル',
  native_frog: '在来カエル',
  noise: 'ノイズ',
  other: 'その他',
  unclear: '不明',
}
const QUALITY_LABEL: Record<string, string> = { good: '鮮明', acceptable: '普通', poor: '不鮮明' }
const AUDIO_QUALITY_LABEL: Record<string, string> = { good: '鮮明', acceptable: '普通', poor: '不鮮明' }

export default function AIBadge({ post }: { post: AdminPost }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const hasPhotos = !!post.photos?.length
  const hasAudio = !!post.audio_url
  if (!hasPhotos && !hasAudio) return <span className="text-xs text-gray-300">—</span>

  const ai = post.ai_result
  if (!ai) {
    return <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">⏳ 判定中</span>
  }

  const audio = ai.audio_analysis
  const imageAnalyzed = hasPhotos && (ai.detected_species != null || ai.error != null)
  const audioAnalyzed = hasAudio && !!audio

  // 画像判定の要約（写真があれば）
  const imageSummary = hasPhotos ? summarize({
    detected_species: ai.detected_species,
    species_match: ai.species_match,
    confidence: ai.confidence,
    is_appropriate: ai.is_appropriate,
    error: ai.error,
    error_kind: ai.error_kind,
  }) : null

  // 音声判定の要約（音声があれば）
  const audioSummary = hasAudio && audio ? summarize({
    detected_species: audio.detected_species,
    species_match: audio.species_match,
    confidence: audio.confidence,
    is_appropriate: audio.is_appropriate,
    error: audio.error,
    error_kind: audio.error_kind,
  }) : null

  // バッジ表示: 画像と音声で優先度を決める
  const primary = imageSummary && audioSummary
    ? pickPriority(imageSummary, audioSummary)
    : (imageSummary ?? audioSummary)

  if (!primary) {
    return <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">⏳ 判定中</span>
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className={`text-xs px-2 py-0.5 rounded-full border font-medium transition-opacity hover:opacity-80 whitespace-nowrap ${primary.cls}`}
      >
        {primary.icon} {primary.label}
      </button>

      {open && (
        <div className="absolute left-0 top-7 z-50 bg-white border border-gray-200 rounded-xl shadow-2xl p-4 w-72 text-left">
          <p className="text-xs font-bold text-gray-700 mb-2">🤖 AI 判定結果</p>

          {hasPhotos && (
            <DetailBlock
              title="📷 画像判定"
              detected={ai.detected_species}
              match={ai.species_match}
              confidence={ai.confidence}
              quality={ai.image_quality}
              qualityLabel={QUALITY_LABEL}
              appropriate={ai.is_appropriate}
              error={ai.error}
              errorKind={ai.error_kind}
              notes={ai.notes}
              notAnalyzed={!imageAnalyzed}
            />
          )}

          {hasPhotos && hasAudio && <div className="border-t border-gray-100 my-3" />}

          {hasAudio && (
            <DetailBlock
              title="🎤 音声判定"
              detected={audio?.detected_species}
              match={audio?.species_match}
              confidence={audio?.confidence}
              quality={audio?.audio_quality}
              qualityLabel={AUDIO_QUALITY_LABEL}
              appropriate={audio?.is_appropriate}
              error={audio?.error}
              errorKind={audio?.error_kind}
              notes={audio?.notes}
              notAnalyzed={!audioAnalyzed}
            />
          )}

          {ai.combined_decision && (
            <div className="mt-3 pt-3 border-t border-gray-100 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-400">統合判定</span>
                <span className="font-medium text-gray-700">{reasonLabel(ai.combined_decision.reason)}</span>
              </div>
            </div>
          )}

          <p className="mt-2 text-xs text-gray-300 italic">AIによる参考情報です</p>
        </div>
      )}
    </div>
  )
}

interface SummaryInput {
  detected_species?: string
  species_match?: boolean | null
  confidence?: number | null
  // REQ-215: null = 不明（自動承認に進ませない）。
  is_appropriate?: boolean | null
  error?: string
  error_kind?: string
}

interface Summary {
  cls: string
  icon: string
  label: string
  priority: number  // 大きいほど優先表示（不適切 > 不一致 > 一致 > 要確認）
}

function summarize(a: SummaryInput): Summary | null {
  if (a.error) {
    if (a.error_kind === 'image_fetch') {
      return { cls: 'bg-amber-100 text-amber-700 border-amber-200', icon: '⚠️', label: '取得失敗', priority: 2 }
    }
    if (a.error_kind === 'gemini_api') {
      return { cls: 'bg-amber-100 text-amber-700 border-amber-200', icon: '⚠️', label: 'APIエラー', priority: 2 }
    }
    if (a.error_kind === 'json_parse') {
      return { cls: 'bg-red-100 text-red-700 border-red-200', icon: '🚫', label: '分析拒否', priority: 3 }
    }
    return { cls: 'bg-gray-100 text-gray-500 border-gray-200', icon: '—', label: '判定失敗', priority: 2 }
  }
  if (a.is_appropriate === false) {
    return { cls: 'bg-red-100 text-red-700 border-red-200', icon: '❌', label: '不適切', priority: 4 }
  }
  const conf = a.confidence != null ? Math.round(a.confidence * 100) : null
  if (a.species_match === false) {
    return { cls: 'bg-amber-100 text-amber-700 border-amber-200', icon: '⚠️', label: '種不一致', priority: 3 }
  }
  if (a.species_match === true && (conf ?? 0) >= 70) {
    return { cls: 'bg-green-100 text-green-700 border-green-200', icon: '✅', label: `${conf}% 一致`, priority: 1 }
  }
  return { cls: 'bg-gray-100 text-gray-600 border-gray-200', icon: '🔍', label: conf != null ? `要確認 ${conf}%` : '要確認', priority: 0 }
}

function pickPriority(a: Summary, b: Summary): Summary {
  return a.priority >= b.priority ? a : b
}

function reasonLabel(reason: string): string {
  const map: Record<string, string> = {
    audio_only_high_confidence: '音声のみ高信頼で承認',
    both_modalities_match: '画像・音声ともに一致',
    audio_species_mismatch: '音声で種不一致',
    species_mismatch_modalities: '画像と音声で矛盾',
    inappropriate_content: '不適切コンテンツ',
    audio_error: '音声判定エラー',
    waiting_for_image_analysis: '画像判定待ち',
    needs_manual_review: '要手動確認',
  }
  return map[reason] ?? reason
}

interface DetailBlockProps {
  title: string
  detected?: string
  match?: boolean | null
  confidence?: number | null
  quality?: string
  qualityLabel: Record<string, string>
  // REQ-215: null = 不明（自動承認に進ませない）。
  appropriate?: boolean | null
  error?: string
  errorKind?: string
  notes?: string | null
  notAnalyzed?: boolean
}

function DetailBlock({ title, detected, match, confidence, quality, qualityLabel, appropriate, error, errorKind, notes, notAnalyzed }: DetailBlockProps) {
  const conf = confidence != null ? Math.round(confidence * 100) : null
  return (
    <div>
      <p className="text-xs font-semibold text-gray-600 mb-1.5">{title}</p>
      {notAnalyzed ? (
        <p className="text-xs text-gray-400">⏳ 判定中</p>
      ) : error ? (
        <p className={`text-xs ${errorKind === 'image_fetch' || errorKind === 'gemini_api' ? 'text-amber-600' : 'text-red-500'}`}>
          {badgeErrorLabel(errorKind)}
        </p>
      ) : (
        <div className="space-y-1.5 text-xs text-gray-600">
          <div className="flex justify-between">
            <span className="text-gray-400">検出種</span>
            <span className="font-medium">{detected ? (DETECTED_SPECIES_LABEL[detected] ?? detected) : '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">申告との一致</span>
            <span className={match === true ? 'text-green-600 font-medium' : match === false ? 'text-red-600 font-medium' : 'text-gray-400'}>
              {match === true ? '✅ 一致' : match === false ? '❌ 不一致' : '不明'}
            </span>
          </div>
          {conf != null && (
            <div className="flex justify-between items-center">
              <span className="text-gray-400">信頼度</span>
              <div className="flex items-center gap-1.5">
                <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${conf >= 70 ? 'bg-green-500' : conf >= 50 ? 'bg-amber-400' : 'bg-red-400'}`}
                    style={{ width: `${conf}%` }}
                  />
                </div>
                <span className="font-medium">{conf}%</span>
              </div>
            </div>
          )}
          {quality && (
            <div className="flex justify-between">
              <span className="text-gray-400">品質</span>
              <span>{qualityLabel[quality] ?? quality}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-gray-400">適切性</span>
            {/* REQ-215 FR-215-02: tri-state（true=問題なし / false=要注意 / null=不明）。
                null（不明）を「問題なし」と誤表示しないこと（フェイルセーフ）。 */}
            <span className={appropriate === false ? 'text-red-600 font-medium' : appropriate === true ? 'text-green-600' : 'text-gray-400'}>
              {appropriate === false ? '⚠️ 要注意' : appropriate === true ? '問題なし' : '不明'}
            </span>
          </div>
          {notes && (
            <p className="mt-1.5 pt-1.5 border-t border-gray-100 text-xs text-gray-500 leading-relaxed">{notes}</p>
          )}
        </div>
      )}
    </div>
  )
}

function badgeErrorLabel(kind: string | undefined): string {
  const map: Record<string, string> = {
    image_fetch: '取得失敗',
    gemini_api: 'AI API エラー',
    json_parse: 'AI が分析を拒否',
  }
  return map[kind ?? ''] ?? '判定失敗'
}
