'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Play, Pause } from 'lucide-react'

interface AudioPlayerProps {
  src: string
  className?: string
  // REQ-083: 録音時に算出した duration を ms で渡すと、ファイル metadata の不備に
  // 影響されず確実に「合計時間」表示ができる。指定が無ければ <audio>.duration を採用。
  durationMs?: number | null
}

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '--:--'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

/**
 * REQ-083: native `<audio controls>` は webm container の duration metadata 欠落時に
 * 0:00 / 0:00 を表示してしまう。これを避けるため、再生本体は隠した <audio> 要素で行い、
 * UI は durationMs prop を優先した自前コントロールで描画する。
 *
 * 表示優先度:
 *   1. props.durationMs (DB 由来 / 録音時実測値)
 *   2. audio.duration が finite ならそれ
 *   3. それでも不明なら "--:--"
 */
export default function AudioPlayer({ src, className, durationMs }: AudioPlayerProps) {
  const { t } = useTranslation()
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [audioDuration, setAudioDuration] = useState<number>(NaN)
  const [loadError, setLoadError] = useState(false)

  // 表示用の合計時間（秒）
  const totalSec =
    typeof durationMs === 'number' && durationMs > 0
      ? durationMs / 1000
      : Number.isFinite(audioDuration) && audioDuration > 0
        ? audioDuration
        : NaN

  const togglePlay = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) {
      void audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false))
    } else {
      audio.pause()
      setIsPlaying(false)
    }
  }, [])

  // src が変わったらリセット
  useEffect(() => {
    setIsPlaying(false)
    setCurrentTime(0)
    setLoadError(false)
    setAudioDuration(NaN)
  }, [src])

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current
    if (!audio || !Number.isFinite(totalSec) || totalSec <= 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    try {
      audio.currentTime = ratio * totalSec
    } catch {
      /* noop */
    }
  }, [totalSec])

  // 矢印キーでシークするためのキーボードハンドラ (a11y)
  const handleSeekKey = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const audio = audioRef.current
    if (!audio || !Number.isFinite(totalSec) || totalSec <= 0) return
    const STEP = 5 // 5秒
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault()
      try { audio.currentTime = Math.min(totalSec, audio.currentTime + STEP) } catch { /* noop */ }
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault()
      try { audio.currentTime = Math.max(0, audio.currentTime - STEP) } catch { /* noop */ }
    } else if (e.key === 'Home') {
      e.preventDefault()
      try { audio.currentTime = 0 } catch { /* noop */ }
    } else if (e.key === 'End') {
      e.preventDefault()
      try { audio.currentTime = totalSec } catch { /* noop */ }
    }
  }, [totalSec])

  const handleError = useCallback((e: React.SyntheticEvent<HTMLAudioElement>) => {
    const audio = e.currentTarget
    const code = audio.error?.code
    // 真のエラーのみ fallback。MEDIA_ERR_DECODE (3) や ABORTED (1) は無視。
    if (code === 2 || code === 4) setLoadError(true)
  }, [])

  if (!src) return null

  const progressPct = Number.isFinite(totalSec) && totalSec > 0
    ? Math.min(100, (currentTime / totalSec) * 100)
    : 0

  return (
    <div className={className}>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(e) => setAudioDuration(e.currentTarget.duration)}
        onDurationChange={(e) => setAudioDuration(e.currentTarget.duration)}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onEnded={() => { setIsPlaying(false); setCurrentTime(0) }}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
        onError={handleError}
        aria-label={t('audio.ariaLabel')}
        className="sr-only"
      />

      <div className="flex items-center gap-2 rounded-full bg-gray-100 dark:bg-slate-800 px-3 py-2">
        <button
          type="button"
          onClick={togglePlay}
          aria-label={isPlaying ? t('audio.pause', { defaultValue: '一時停止' }) : t('audio.play', { defaultValue: '再生' })}
          className="shrink-0 flex items-center justify-center w-9 h-9 rounded-full bg-brand-600 hover:bg-brand-700 text-white transition-colors"
        >
          {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
        </button>

        <div
          role="slider"
          aria-label={t('audio.progress', { defaultValue: '再生位置' })}
          aria-valuenow={Math.round(progressPct)}
          aria-valuemin={0}
          aria-valuemax={100}
          tabIndex={0}
          onClick={handleSeek}
          onKeyDown={handleSeekKey}
          className="flex-1 h-2 rounded-full bg-gray-300 dark:bg-slate-600 cursor-pointer relative overflow-hidden"
        >
          <div
            className="absolute inset-y-0 left-0 bg-brand-600 transition-[width] duration-100"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        <span className="shrink-0 text-xs tabular-nums text-gray-600 dark:text-slate-300 min-w-[60px] text-right">
          {formatTime(currentTime)} / {formatTime(totalSec)}
        </span>
      </div>

      {loadError && (
        <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
          {t('audio.previewError')}{' '}
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="text-red-500 underline underline-offset-2"
          >
            {t('audio.downloadFallback')}
          </a>
        </p>
      )}
    </div>
  )
}
