'use client'
// REQ-282 D-8（分割候補・実施は個別REQ）: MediaRecorder/レベルメーター等の録音エンジンをカスタムフック化しUIと分離する（561行）。

import { useState, useEffect, useRef, useCallback } from 'react'
import { Mic, Square, RotateCcw, Check, Trash2, Upload, AlertCircle, ExternalLink, Copy } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@/context/ThemeContext'
import { useToastContext } from '@/context/ToastContext'
import { checkSilence } from '@/lib/audio/silenceDetect'
import { patchWebmDuration } from '@/lib/audio/fixWebmDuration'
import AudioPlayer from '@/components/ui/AudioPlayer'
import {
  classifyMicError,
  queryMicPermission,
  checkSecureContext,
  type MicErrorKind,
} from '@/lib/audio/permission'
import { detectInAppBrowser } from '@/lib/audio/inAppBrowser'
import MicPermissionGuide from './MicPermissionGuide'

const MAX_AUDIO_SIZE = 1_048_576 // 1MB (post-audio bucket 上限と同じ)
const ALLOWED_UPLOAD_MIME = ['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/mp3']

interface AudioRecorderProps {
  onRecorded: (blob: Blob, mimeType: string, durationMs: number) => void
  onCleared: () => void
  disabled?: boolean
  maxDurationMs?: number
}

type RecorderState = 'idle' | 'recording' | 'recorded' | 'denied' | 'unsupported'
type SourceMode = 'record' | 'upload'

function pickMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/mpeg']
  for (const t of candidates) {
    if (MediaRecorder.isTypeSupported(t)) return t
  }
  return null
}

export default function AudioRecorder({
  onRecorded,
  onCleared,
  disabled = false,
  maxDurationMs = 10_000,
}: AudioRecorderProps) {
  const { dark } = useTheme()
  const { t } = useTranslation()
  const toast = useToastContext()
  const [mode, setMode] = useState<SourceMode>('record')
  const [state, setState] = useState<RecorderState>('idle')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [levels, setLevels] = useState<number[]>(() => Array(24).fill(0))
  const [remainingMs, setRemainingMs] = useState(maxDurationMs)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [durationMs, setDurationMs] = useState(0)
  // REQ-081: エラー種別と権限ガイドの表示制御
  const [errorKind, setErrorKind] = useState<MicErrorKind | null>(null)
  const [showGuide, setShowGuide] = useState(false)
  const [inAppKind] = useState(() => detectInAppBrowser())

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const rafRef = useRef<number | null>(null)
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // REQ-274 FR-274-03: 残り時間カウントダウンの interval。ref に保持しないと
  // アンマウント/手動停止後も setRemainingMs が maxDurationMs まで発火し続ける。
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startedAtRef = useRef<number>(0)
  const chunksRef = useRef<Blob[]>([])
  const mimeTypeRef = useRef<string>('')

  useEffect(() => {
    // 録音不可の場合はファイルアップロードのみに自動切替（MediaRecorder 非対応時のフォールバック）
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setMode('upload')
    }
  }, [])

  const cleanup = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current)
    if (tickRef.current) clearInterval(tickRef.current)
    rafRef.current = null
    stopTimerRef.current = null
    tickRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    audioCtxRef.current?.close().catch(() => undefined)
    audioCtxRef.current = null
    analyserRef.current = null
    recorderRef.current = null
  }, [])

  useEffect(() => cleanup, [cleanup])

  const startLevelMeter = (stream: MediaStream) => {
    try {
      const AudioCtx: typeof AudioContext =
        (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)
      const ctx = new AudioCtx()
      const src = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 64
      src.connect(analyser)
      audioCtxRef.current = ctx
      analyserRef.current = analyser

      const data = new Uint8Array(analyser.frequencyBinCount)
      const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      const draw = () => {
        analyser.getByteFrequencyData(data)
        if (!reducedMotion) {
          const bars = Array.from({ length: 24 }, (_, i) => {
            const start = Math.floor((i / 24) * data.length)
            const end = Math.floor(((i + 1) / 24) * data.length)
            let sum = 0
            for (let j = start; j < end; j++) sum += data[j] ?? 0
            return Math.min(1, (sum / (end - start)) / 180)
          })
          setLevels(bars)
        }
        rafRef.current = requestAnimationFrame(draw)
      }
      rafRef.current = requestAnimationFrame(draw)
    } catch { /* noop */ }
  }

  // REQ-081: エラー種別ごとの toast & 拒否時の自動 mode='upload' fallback
  const handleMicError = useCallback((kind: MicErrorKind) => {
    setErrorKind(kind)
    if (kind === 'denied' || kind === 'insecure' || kind === 'unsupported' || kind === 'not_found') {
      setState('denied')
      // 拒否系は救済として upload モードに自動切替
      setMode('upload')
    }
    const messageKey =
      kind === 'denied' ? 'audio.permission.denied'
      : kind === 'not_found' ? 'audio.permission.notFound'
      : kind === 'busy' ? 'audio.permission.busy'
      : kind === 'overconstrained' ? 'audio.permission.overconstrained'
      : kind === 'insecure' ? 'audio.permission.insecure'
      : kind === 'unsupported' ? 'audio.permission.unsupported'
      : kind === 'aborted' ? 'audio.permission.aborted'
      : 'audio.permission.unknown'
    toast.error(t(messageKey))
  }, [toast, t])

  const startRecording = useCallback(async () => {
    setErrorKind(null)
    if (!checkSecureContext()) {
      handleMicError('insecure')
      return
    }
    const mime = pickMimeType()
    if (!mime) {
      handleMicError('unsupported')
      return
    }
    // REQ-081 FR-081-02: Permissions API で事前確認（非対応ブラウザでは 'unknown' で素通り）
    const perm = await queryMicPermission()
    if (perm === 'denied') {
      handleMicError('denied')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      mimeTypeRef.current = mime
      chunksRef.current = []

      const recorder = new MediaRecorder(stream, { mimeType: mime })
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        const rawBlob = new Blob(chunksRef.current, { type: mime })
        const dur = Date.now() - startedAtRef.current
        setState('recorded')
        if (rafRef.current) cancelAnimationFrame(rafRef.current)
        // REQ-274: 手動停止後に残時間表示がカウントダウンを続けないよう interval も止める。
        if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null }
        stream.getTracks().forEach((t) => t.stop())

        // REQ-082: webm の場合 duration metadata を埋め込む。失敗時は元 blob を使う。
        void (async () => {
          const blob = await patchWebmDuration(rawBlob, mime, dur)
          const url = URL.createObjectURL(blob)
          setPreviewUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev)
            return url
          })
          setDurationMs(dur)
          onRecorded(blob, mime, dur)

          // REQ-077: 録音完了後に無音 / 短すぎチェック（警告のみ、強制弾きしない）
          if (dur > 0 && dur < 1000) {
            toast.error('録音が短すぎます。もう少し長く録音するのが推奨です')
          }
          const silence = await checkSilence(blob)
          if (silence?.isSilent) {
            toast.error('音が小さすぎる可能性があります。録音環境を確認してください')
          }
        })()
      }
      recorderRef.current = recorder
      recorder.start()
      startedAtRef.current = Date.now()
      setState('recording')
      setRemainingMs(maxDurationMs)
      startLevelMeter(stream)

      stopTimerRef.current = setTimeout(() => {
        if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
      }, maxDurationMs)

      // REQ-274: ref 管理にし cleanup()/onstop の両方で clear する（リーク防止）。
      if (tickRef.current) clearInterval(tickRef.current)
      tickRef.current = setInterval(() => {
        const elapsed = Date.now() - startedAtRef.current
        const rem = Math.max(0, maxDurationMs - elapsed)
        setRemainingMs(rem)
        if (rem <= 0 && tickRef.current) { clearInterval(tickRef.current); tickRef.current = null }
      }, 200)
    } catch (err) {
      handleMicError(classifyMicError(err))
    }
  }, [maxDurationMs, onRecorded, toast, handleMicError])

  const stopRecording = useCallback(() => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
  }, [])

  const clearRecording = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    setDurationMs(0)
    setLevels(Array(24).fill(0))
    setState('idle')
    if (fileInputRef.current) fileInputRef.current.value = ''
    onCleared()
  }, [previewUrl, onCleared])

  const pendingFileRef = useRef<{ file: File; mime: string } | null>(null)

  const handleFileSelected = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    // サイズチェック
    if (file.size > MAX_AUDIO_SIZE) {
      toast.error(`ファイルサイズが大きすぎます（${(file.size / 1024 / 1024).toFixed(1)}MB）。1MB 以下にしてください`)
      e.target.value = ''
      return
    }
    // MIME チェック
    const isAllowed = ALLOWED_UPLOAD_MIME.some((m) => file.type === m || file.type.startsWith(m.split(';')[0] ?? ''))
    if (!isAllowed && file.type !== '') {
      toast.error('対応していない音声形式です（webm / mp4 / mp3 / ogg のみ）')
      e.target.value = ''
      return
    }
    // プレビュー用 URL を生成し、即座に <audio> 要素にマウントする。
    // duration は <audio> の onLoadedMetadata で反映する（別途 new Audio() を
    // 作ると blob URL を二重参照したまま解放されず、再生が不安定になるため）。
    const url = URL.createObjectURL(file)
    const mime = file.type || 'audio/webm'
    pendingFileRef.current = { file, mime }
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return url
    })
    setDurationMs(0)
    setState('recorded')
  }, [toast])

  const handlePreviewMetadata = useCallback((e: React.SyntheticEvent<HTMLAudioElement>) => {
    const audio = e.currentTarget
    // VBR ヘッダの無い MP3 は duration=Infinity になるので seek トリックで再計測させる
    if (!Number.isFinite(audio.duration)) {
      const onTimeUpdate = () => {
        audio.removeEventListener('timeupdate', onTimeUpdate)
        audio.currentTime = 0
        const pending = pendingFileRef.current
        if (!pending) return
        const fixedDur = audio.duration
        const durationMs = Number.isFinite(fixedDur) && fixedDur > 0 ? Math.round(fixedDur * 1000) : 0
        setDurationMs(durationMs)
        onRecorded(pending.file, pending.mime, durationMs)
        pendingFileRef.current = null
      }
      audio.addEventListener('timeupdate', onTimeUpdate)
      audio.currentTime = 1e101
      return
    }

    const pending = pendingFileRef.current
    if (!pending) return
    const durationMs = audio.duration > 0 ? Math.round(audio.duration * 1000) : 0
    setDurationMs(durationMs)
    onRecorded(pending.file, pending.mime, durationMs)
    pendingFileRef.current = null
  }, [onRecorded])

  const handlePreviewError = useCallback(() => {
    if (!pendingFileRef.current) return
    const pending = pendingFileRef.current
    pendingFileRef.current = null
    // メタデータ読み込みに失敗しても投稿自体は継続できるよう、duration=0 で親に通知する
    onRecorded(pending.file, pending.mime, 0)
    toast.error('このファイルはブラウザでプレビューできませんが、投稿は可能です')
  }, [onRecorded, toast])

  const remainingSec = Math.ceil(remainingMs / 1000)
  const labelBg = dark ? 'bg-slate-800' : 'bg-gray-100'
  const labelText = dark ? 'text-slate-200' : 'text-gray-700'

  // state === 'unsupported' は effect で mode='upload' に自動切替されるため、録音 UI は非表示になる

  // REQ-081 FR-081-03: In-App ブラウザ検出時の URL コピー
  const copyCurrentUrl = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      toast.error(t('audio.permission.urlCopied'))
    } catch {
      toast.error(t('audio.permission.unknown'))
    }
  }, [toast, t])

  return (
    <div className={`rounded-xl border p-3 ${dark ? 'border-slate-700 bg-slate-900' : 'border-gray-200 bg-white'}`} aria-live="polite">
      {/* REQ-081 FR-081-03: In-App ブラウザ警告 */}
      {inAppKind && (
        <div
          role="alert"
          className={`flex items-start gap-2 mb-2 p-2 rounded-lg text-xs ${
            dark ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30' : 'bg-amber-50 text-amber-800 border border-amber-200'
          }`}
        >
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          <div className="flex-1">
            <p>{t('audio.permission.inAppWarning')}</p>
            <button
              type="button"
              onClick={copyCurrentUrl}
              className="mt-1 inline-flex items-center gap-1 text-xs underline underline-offset-2 hover:no-underline"
            >
              <Copy size={11} />
              {t('audio.permission.copyUrl')}
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-2">
        <span className={`text-sm font-semibold ${labelText}`}>🎤 鳴き声で投稿</span>
        {state === 'recording' && (
          <span className="text-xs font-bold text-red-500 tabular-nums">残り {remainingSec} 秒</span>
        )}
        {state === 'recorded' && (
          <span className={`text-xs ${dark ? 'text-slate-400' : 'text-gray-500'} tabular-nums`}>
            {(durationMs / 1000).toFixed(1)} 秒
          </span>
        )}
      </div>

      {state === 'idle' && (
        <>
          {/* モード切替タブ */}
          <div
            role="tablist"
            aria-label="音声の入力方法"
            // REQ-325 FR-325-01: トラックが gray-100(#f3f4f6) なので、非選択ラベルの gray-500 は
            // 4.39:1 で AA 未満だった（RankingPage のタブと同型）。gray-600 で 6.87:1。
            className={`inline-flex rounded-lg p-0.5 mb-2 w-full ${dark ? 'bg-slate-800' : 'bg-gray-100'}`}
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'record'}
              onClick={() => setMode('record')}
              className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-md text-xs font-medium transition-all ${
                mode === 'record'
                  ? dark ? 'bg-slate-700 text-white shadow-xs' : 'bg-white text-brand-700 shadow-xs'
                  : dark ? 'text-slate-400' : 'text-gray-600'
              }`}
            >
              <Mic size={14} />
              録音する
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'upload'}
              onClick={() => setMode('upload')}
              className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-md text-xs font-medium transition-all ${
                mode === 'upload'
                  ? dark ? 'bg-slate-700 text-white shadow-xs' : 'bg-white text-brand-700 shadow-xs'
                  : dark ? 'text-slate-400' : 'text-gray-600'
              }`}
            >
              <Upload size={14} />
              ファイルを選択
            </button>
          </div>

          {mode === 'record' ? (
            <button
              type="button"
              onClick={startRecording}
              disabled={disabled}
              className="w-full flex items-center justify-center gap-2 min-h-[44px] rounded-lg bg-brand-600 text-white font-bold hover:bg-brand-700 disabled:opacity-50 transition-colors"
            >
              <Mic size={18} />
              鳴き声を録音（最大 {Math.floor(maxDurationMs / 1000)} 秒）
            </button>
          ) : (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/webm,audio/mp4,audio/mpeg,audio/mp3,audio/ogg,audio/*"
                onChange={handleFileSelected}
                disabled={disabled}
                className="sr-only"
                id="audio-file-input"
              />
              <label
                htmlFor="audio-file-input"
                className={`w-full flex items-center justify-center gap-2 min-h-[44px] rounded-lg font-bold cursor-pointer transition-colors ${
                  disabled
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-brand-600 text-white hover:bg-brand-700'
                }`}
              >
                <Upload size={18} />
                音声ファイルを選ぶ
              </label>
              <p className={`text-[11px] mt-1.5 text-center ${dark ? 'text-slate-500' : 'text-gray-500'}`}>
                対応形式: webm / mp4 / mp3 / ogg（最大 1MB）
              </p>
            </>
          )}
        </>
      )}

      {state === 'recording' && (
        <>
          <div className={`flex items-end justify-between gap-0.5 h-12 px-2 mb-2 rounded-lg ${labelBg}`} aria-hidden="true">
            {levels.map((v, i) => (
              <span
                key={i}
                className="flex-1 rounded-xs bg-brand-600 transition-[height] duration-75"
                style={{ height: `${Math.max(6, v * 100)}%` }}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={stopRecording}
            className="w-full flex items-center justify-center gap-2 min-h-[44px] rounded-lg bg-gray-800 text-white font-bold hover:bg-gray-900 transition-colors"
          >
            <Square size={18} fill="currentColor" />
            停止
          </button>
        </>
      )}

      {state === 'recorded' && previewUrl && (
        <>
          {/* preview 用の見えない audio: pendingFileRef 経由の duration 取得用に維持 */}
          {mode === 'upload' && pendingFileRef.current && (
            <audio
              src={previewUrl}
              preload="metadata"
              onLoadedMetadata={handlePreviewMetadata}
              onError={handlePreviewError}
              className="sr-only"
            />
          )}
          <div className="mb-2">
            <AudioPlayer src={previewUrl} durationMs={durationMs > 0 ? durationMs : null} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                if (mode === 'record') {
                  clearRecording()
                  void startRecording()
                } else {
                  clearRecording()
                  fileInputRef.current?.click()
                }
              }}
              className={`flex items-center justify-center gap-1.5 min-h-[44px] rounded-lg border text-sm font-medium transition-colors ${
                dark ? 'border-slate-700 text-slate-200 hover:bg-slate-800' : 'border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              <RotateCcw size={16} />
              {mode === 'record' ? '再録音' : '再選択'}
            </button>
            <button
              type="button"
              onClick={clearRecording}
              // REQ-325 FR-325-01: hover で下地が red-50 になると red-600 は 4.41:1 で AA 未満。
              // 淡赤面に載せる赤は brand-700（red-50 上 5.91:1 / 白地 6.47:1）。
              className={`flex items-center justify-center gap-1.5 min-h-[44px] rounded-lg border text-sm font-medium transition-colors ${
                dark ? 'border-slate-700 text-red-400 hover:bg-slate-800' : 'border-gray-300 text-brand-700 hover:bg-red-50'
              }`}
            >
              <Trash2 size={16} />
              破棄
            </button>
          </div>
          <div className={`mt-2 flex items-center gap-1.5 text-xs ${dark ? 'text-green-400' : 'text-green-600'}`}>
            <Check size={14} />
            {mode === 'record' ? '録音完了' : '音声ファイル選択済み'}。投稿ボタンで送信されます
          </div>
        </>
      )}

      {state === 'denied' && (
        <div
          role="alert"
          className={`flex flex-col gap-2 text-xs p-2.5 rounded-lg ${dark ? 'bg-red-500/10 text-red-400 border border-red-500/30' : 'bg-red-50 text-red-700 border border-red-200'}`}
        >
          <div className="flex items-start gap-1.5">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <p>
              {t(
                errorKind === 'not_found' ? 'audio.permission.notFound'
                : errorKind === 'busy' ? 'audio.permission.busy'
                : errorKind === 'overconstrained' ? 'audio.permission.overconstrained'
                : errorKind === 'insecure' ? 'audio.permission.insecure'
                : errorKind === 'unsupported' ? 'audio.permission.unsupported'
                : 'audio.permission.denied',
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 mt-1">
            <button
              type="button"
              onClick={() => setShowGuide(true)}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                dark ? 'bg-red-500/20 hover:bg-red-500/30' : 'bg-white border border-red-300 hover:bg-red-100'
              }`}
            >
              <ExternalLink size={11} />
              {t('audio.permission.showGuide')}
            </button>
            <button
              type="button"
              onClick={() => { setMode('upload'); setState('idle'); setErrorKind(null) }}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                dark ? 'bg-slate-700 hover:bg-slate-600 text-slate-200' : 'bg-white border border-gray-300 hover:bg-gray-100 text-gray-700'
              }`}
            >
              <Upload size={11} />
              {t('audio.permission.switchToUpload')}
            </button>
          </div>
        </div>
      )}

      {showGuide && <MicPermissionGuide onClose={() => setShowGuide(false)} dark={dark} />}
    </div>
  )
}
