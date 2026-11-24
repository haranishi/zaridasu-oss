import type { WaterFeature, WaterPosition } from '../../types'

/** Synthetic locations only; no production observations are used in benchmarks. */
export function geometryFixture(featureCount: number, vertices: number, pointCount: number, center = { lat: 39.72, lng: 140.1 }) {
  const features: WaterFeature[] = Array.from({ length: featureCount }, (_, index) => {
    const lng = center.lng + ((index % 10) - 4.5) * 0.002
    const lat = center.lat + (Math.floor(index / 10) - featureCount / 20) * 0.002
    const ring = Array.from({ length: vertices }, (_, vertex) => {
      const angle = vertex * Math.PI * 2 / vertices
      const radius = 0.0007 * (1 + 0.12 * Math.sin(angle * 5))
      return [lng + radius * Math.cos(angle), lat + radius * Math.sin(angle)]
    })
    ring.push([...ring[0]!])
    return { type: 'Feature', id: `synthetic-${index}`, properties: { name: `Synthetic water ${index}` }, geometry: { type: 'Polygon', coordinates: [ring] } }
  })
  let seed = 0x5eed1234
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 0x1_0000_0000 }
  const points: WaterPosition[] = Array.from({ length: pointCount }, () => ({
    lat: center.lat + (random() - 0.5) * Math.max(0.006, featureCount / 10 * 0.002),
    lng: center.lng + (random() - 0.5) * 0.024,
  }))
  return { features, center, points }
}
