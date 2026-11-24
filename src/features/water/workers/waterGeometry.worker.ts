import { instantiateWaterGeometry } from '../lib/waterGeometryKernel'
import { WATER_GEOMETRY_URL } from '../lib/waterGeometryAsset'

const kernel = (async () => {
  const response = await fetch(WATER_GEOMETRY_URL, { signal: AbortSignal.timeout(6000) })
  if (!response.ok) throw new Error('geometry asset')
  return instantiateWaterGeometry(await response.arrayBuffer())
})()

void kernel.then(() => self.postMessage({ ready: true }), () => self.postMessage({ failed: true }))

self.onmessage = async (event: MessageEvent<{ id: number; input: Float64Array }>) => {
  const { id, input } = event.data
  try {
    const output = (await kernel).calculate(input)
    self.postMessage({ id, output }, { transfer: [output.buffer] })
  } catch {
    self.postMessage({ id, failed: true })
  }
}
