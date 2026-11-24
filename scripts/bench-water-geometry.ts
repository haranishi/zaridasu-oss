import { readFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { geometryFixture } from '../src/features/water/lib/__fixtures__/geometry'
import { createWaterCandidates, waterCandidateRows } from '../src/features/water/lib/candidates'
import { instantiateWaterGeometry } from '../src/features/water/lib/waterGeometryKernel'
import { packWaterGeometry, unpackWaterGeometry } from '../src/features/water/lib/waterGeometryPacket'

const manifest = JSON.parse(readFileSync('rust/water-geometry/artifact.json', 'utf8')) as { url: string }
const start = performance.now()
const kernel = await instantiateWaterGeometry(Uint8Array.from(readFileSync(`public${manifest.url}`)).buffer)
const coldMs = performance.now() - start
function median(action: () => unknown) {
  for (let index = 0; index < 8; index++) action()
  const times = Array.from({ length: 15 }, () => {
    const start = performance.now()
    for (let index = 0; index < 5; index++) action()
    return (performance.now() - start) / 5
  }).sort((a, b) => a - b)
  return times[Math.floor(times.length / 2)]!
}
const results = []
for (const [name, waters, vertices, records] of [['small', 8, 16, 100], ['representative', 30, 64, 300], ['heavy', 200, 256, 1000]] as const) {
  const fixture = geometryFixture(waters, vertices, records)
  const { features, center, points } = fixture
  const rows = waterCandidateRows(features, [])
  const packed = packWaterGeometry(rows, center, points, true)
  const originalMs = median(() => createWaterCandidates(features, [], center, points, true))
  const kernelMs = median(() => kernel.calculate(packed))
  const packedMs = median(() => {
    const rows = waterCandidateRows(features, [])
    const input = packWaterGeometry(rows, center, points, true)
    return unpackWaterGeometry(rows, kernel.calculate(input), true, points.length)
  })
  results.push({ name, waters, vertices, records, originalMs, rustKernelMs: kernelMs, rustWithPackingMs: packedMs, speedup: originalMs / packedMs })
}
console.log(JSON.stringify({ runtime: process.version, coldInstantiationMs: coldMs, excludes: ['network', 'worker round trip', 'map rendering'], results }, null, 2))
