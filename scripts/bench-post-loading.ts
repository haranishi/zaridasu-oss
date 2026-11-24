import { performance } from 'node:perf_hooks'
import { gzipSync } from 'node:zlib'
import { selectPublicPostsForMap, type PostsClient } from '../src/lib/data/posts'

// 14a1111の地図用selectを基準にする。実データや認証情報は使用しない。
const previousColumns = 'id, created_at, lat, lng, species, info_type, municipality, comment, photos, user_id, is_anonymous, is_official, count, observed_at, updated_at, survey_duration_minutes, locality, water_body, is_on_water, elevation_m, geo_enriched_at, geo_source'.split(', ')
let selected = ''
selectPublicPostsForMap({ from: () => ({ select: (columns: string) => {
  selected = columns
  return { eq: () => ({}) }
} }) } as unknown as PostsClient)
const currentColumns = selected.split(',').map(column => column.trim().split(':')[0]!)

let seed = 20261011
const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32 }
const uuid = () => Array.from({ length: 8 }, () => Math.floor(random() * 65536).toString(16).padStart(4, '0')).join('')
const rows = Array.from({ length: 2000 }, (_, index) => {
  const date = new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString()
  const enriched = index % 3 !== 0
  return {
    id: uuid(), created_at: date, lat: Number((39.5 + random()).toFixed(3)), lng: Number((139.8 + random()).toFixed(3)),
    species: index % 3 ? 'american' : 'bullfrog', info_type: index % 4 ? 'sighting' : 'capture',
    municipality: '秋田市', comment: `合成データ${index}: 水辺で観察した生物の記録です。`,
    photos: index % 3 ? [] : [`https://fixture.invalid/photos/${uuid()}.webp`],
    user_id: uuid(), is_anonymous: Boolean(index % 2), is_official: false,
    count: index % 4 ? null : index % 15 + 1, observed_at: date, updated_at: date,
    survey_duration_minutes: index % 4 ? null : 30,
    locality: enriched ? '合成地区' : null, water_body: enriched ? '合成川' : null,
    is_on_water: enriched ? Boolean(index % 2) : null, elevation_m: enriched ? index % 100 : null,
    geo_enriched_at: enriched ? date : null, geo_source: enriched ? 'osm' : null,
  }
})

function payload(count: number, columns: string[]) {
  return JSON.stringify(rows.slice(0, count).map(row => Object.fromEntries(columns.map(column => [column, row[column as keyof typeof row]]))))
}
function median(values: number[]) {
  return [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!
}
const cases = [50, 2000].map(count => {
  const before = payload(count, previousColumns)
  const after = payload(count, currentColumns)
  const samples = { before: [] as number[], after: [] as number[] }
  const iterations = count === 50 ? 100 : 5
  for (let round = 0; round < 40; round++) {
    const order = round % 2 ? ['before', 'after'] as const : ['after', 'before'] as const
    for (const name of order) {
      const start = performance.now()
      for (let iteration = 0; iteration < iterations; iteration++) JSON.parse(name === 'before' ? before : after)
      if (round >= 10) samples[name].push((performance.now() - start) / iterations)
    }
  }
  const measure = (json: string, times: number[], columns: string[]) => ({
    columns: columns.length, rawBytes: Buffer.byteLength(json), gzipBytes: gzipSync(json, { level: 9 }).length,
    parseMedianMs: Number(median(times).toFixed(6)),
  })
  return { count, before: measure(before, samples.before, previousColumns), after: measure(after, samples.after, currentColumns) }
})
console.log(JSON.stringify({ runtime: process.version, baseline: '14a1111', fixture: 'seeded synthetic public posts', excludes: 'database time, network latency, image downloads, rendering', cases }, null, 2))
