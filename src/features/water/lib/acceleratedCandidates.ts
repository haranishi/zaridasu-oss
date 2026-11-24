import { createWaterCandidates, waterCandidateRows } from './candidates'
import { packWaterGeometry, unpackWaterGeometry, waterGeometryWork } from './waterGeometryPacket'
import type { CommunityWaterBody, WaterFeature, WaterPosition } from '../types'

const MIN_GEOMETRY_WORK = 50_000
const WORKER_TIMEOUT_MS = 10_000
type Pending = { resolve: (output: Float64Array) => void; reject: (reason: Error) => void; cleanup: () => void }
let worker: Worker | null = null
let ready: Promise<void> | null = null
let unavailable = false
let nextId = 0
const pending = new Map<number, Pending>()

function failWorker() {
  unavailable = true
  worker?.terminate()
  worker = null
  for (const entry of pending.values()) { entry.cleanup(); entry.reject(new Error('geometry worker')) }
  pending.clear()
}

function getWorker() {
  if (unavailable || typeof Worker === 'undefined' || typeof WebAssembly === 'undefined') return null
  if (worker) return worker
  try {
    worker = new Worker(new URL('../workers/waterGeometry.worker.ts', import.meta.url), { type: 'module' })
    ready = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { failWorker(); reject(new Error('geometry startup timeout')) }, WORKER_TIMEOUT_MS)
      worker!.onerror = () => { clearTimeout(timer); failWorker(); reject(new Error('geometry startup')) }
      worker!.onmessage = (event: MessageEvent<{ id?: number; output?: Float64Array; ready?: boolean; failed?: boolean }>) => {
        const message = event.data
        if (message.ready) { clearTimeout(timer); resolve(); return }
        if (message.id === undefined) { clearTimeout(timer); failWorker(); reject(new Error('geometry startup')); return }
        const entry = pending.get(message.id)
        if (!entry) return
        entry.cleanup()
        pending.delete(message.id)
        if (message.failed || !(message.output instanceof Float64Array)) entry.reject(new Error('geometry calculation'))
        else entry.resolve(message.output)
      }
    })
    // A caller may cancel while the asset is still loading.
    void ready.catch(() => {})
    return worker
  } catch { failWorker(); return null }
}

/** Warm only on water search, while the external API request is in flight. */
export async function warmWaterGeometry(): Promise<void> {
  if (!getWorker()) return
  try { await ready } catch { /* The existing implementation remains available. */ }
}

function aborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Water search cancelled', 'AbortError')
}

async function calculateInWorker(input: Float64Array<ArrayBuffer>, signal?: AbortSignal) {
  const active = getWorker()
  if (!active) throw new Error('geometry unavailable')
  await ready
  aborted(signal)
  if (worker !== active) throw new Error('geometry unavailable')
  return new Promise<Float64Array>((resolve, reject) => {
    const id = ++nextId
    const onAbort = () => {
      pending.get(id)?.cleanup()
      pending.delete(id)
      reject(new DOMException('Water search cancelled', 'AbortError'))
    }
    const timer = setTimeout(() => { failWorker() }, WORKER_TIMEOUT_MS)
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort) }
    pending.set(id, { resolve, reject, cleanup })
    signal?.addEventListener('abort', onAbort, { once: true })
    try { active.postMessage({ id, input }, [input.buffer]) }
    catch { cleanup(); pending.delete(id); reject(new Error('geometry dispatch')) }
  })
}

export async function createWaterCandidatesAsync(features: WaterFeature[], community: CommunityWaterBody[], center: WaterPosition, publicPoints: WaterPosition[], complete: boolean, signal?: AbortSignal) {
  aborted(signal)
  const rows = waterCandidateRows(features, community)
  if (waterGeometryWork(rows, complete ? publicPoints.length : 0) >= MIN_GEOMETRY_WORK) {
    try {
      const input = packWaterGeometry(rows, center, publicPoints, complete)
      const output = await calculateInWorker(input, signal)
      aborted(signal)
      return unpackWaterGeometry(rows, output, complete, publicPoints.length)
    } catch { aborted(signal) }
  }
  return createWaterCandidates(features, community, center, publicPoints, complete)
}
