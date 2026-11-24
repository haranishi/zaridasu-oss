// REQ-231 (NFR-231-08 / AC-03 / AC-04): enrich-place のプロバイダ抽象 + パーサの単体テスト。
//
// 検証:
//   (a) Nominatim 応答パース（字 / 水系抽出）
//   (b) フォールバック切替（GEOCODE_PROVIDER）と各プロバイダのパース
//   (c) OnWater / Open Topo Data のパース
//   (d) kill switch（GEO_ENRICH_ENABLED）
//   (e) makeGridKey の丸め（NFR-231-06）
//
// 実行: `deno test --allow-env --allow-net --allow-read \
//   --lock=supabase/functions/deno.lock --cached-only --no-check \
//   supabase/functions/enrich-place/__tests__/geocodeProvider.test.ts`

import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.168.0/testing/asserts.ts'

import {
  extractWaterFromText,
  getProvider,
  getUserAgent,
  isEnrichEnabled,
  makeGridKey,
  parseGeoapify,
  parseNominatim,
  parseOnWater,
  parseOpenCage,
  parseOpenTopoData,
} from '../../_shared/geocodeProvider.ts'

// ===== (a) Nominatim パース =====
Deno.test('parseNominatim: suburb を locality に、river を water_body に抽出する', () => {
  const json = {
    display_name: '秋田県秋田市旭川',
    address: {
      suburb: '旭北栄町',
      city: '秋田市',
      river: '旭川',
      state: '秋田県',
    },
  }
  const r = parseNominatim(json)
  assertEquals(r.locality, '旭北栄町')
  assertEquals(r.water_body, '旭川')
})

Deno.test('parseNominatim: water 系キーが無ければ display_name から「〜川」を拾う', () => {
  const json = {
    display_name: '太平川の近く, 秋田市, 秋田県',
    address: { neighbourhood: '広面' },
  }
  const r = parseNominatim(json)
  assertEquals(r.locality, '広面')
  assertEquals(r.water_body, '太平川')
})

Deno.test('parseNominatim: address が空でも例外を投げず null を返す', () => {
  const r = parseNominatim({})
  assertEquals(r.locality, null)
  assertEquals(r.water_body, null)
})

Deno.test('parseNominatim: null 入力でも壊れない', () => {
  const r = parseNominatim(null)
  assertEquals(r.locality, null)
  assertEquals(r.water_body, null)
})

Deno.test('parseNominatim: locality は suburb→neighbourhood→hamlet の優先順', () => {
  // suburb 無し、hamlet あり → hamlet を採用（quarter より hamlet が先という順序は実装に合わせる）
  const r = parseNominatim({ address: { hamlet: '○○新田', city: 'X市' } })
  assertEquals(r.locality, '○○新田')
})

// ===== extractWaterFromText =====
Deno.test('extractWaterFromText: 川/池/湖/沼/ダムを抽出する', () => {
  assertEquals(extractWaterFromText('雄物川の河川敷'), '雄物川')
  assertEquals(extractWaterFromText('八郎潟調整池の南'), '八郎潟調整池')
  assertEquals(extractWaterFromText('田沢湖周辺'), '田沢湖')
  assertEquals(extractWaterFromText('水辺なし'), null)
  assertEquals(extractWaterFromText(''), null)
})

// ===== (b) OpenCage / Geoapify パース =====
Deno.test('parseOpenCage: components から suburb / river を抽出する', () => {
  const json = {
    results: [{
      formatted: '秋田県横手市',
      components: { suburb: '駅前町', river: '横手川', city: '横手市' },
    }],
  }
  const r = parseOpenCage(json)
  assertEquals(r.locality, '駅前町')
  assertEquals(r.water_body, '横手川')
})

Deno.test('parseOpenCage: results 空でも壊れない', () => {
  const r = parseOpenCage({ results: [] })
  assertEquals(r.locality, null)
  assertEquals(r.water_body, null)
})

Deno.test('parseGeoapify: properties から suburb / water を抽出する', () => {
  const json = {
    features: [{
      properties: { suburb: '土崎港', water: '旧雄物川', city: '秋田市' },
    }],
  }
  const r = parseGeoapify(json)
  assertEquals(r.locality, '土崎港')
  assertEquals(r.water_body, '旧雄物川')
})

Deno.test('parseGeoapify: features 無しでも壊れない', () => {
  const r = parseGeoapify({})
  assertEquals(r.locality, null)
  assertEquals(r.water_body, null)
})

// ===== (c) OnWater / Open Topo Data パース =====
Deno.test('parseOnWater: water boolean をそのまま返す', () => {
  assertEquals(parseOnWater({ water: true }), true)
  assertEquals(parseOnWater({ water: false }), false)
  assertEquals(parseOnWater({}), null)
  assertEquals(parseOnWater(null), null)
})

Deno.test('parseOpenTopoData: results[0].elevation を返す', () => {
  assertEquals(parseOpenTopoData({ results: [{ elevation: 12.5 }] }), 12.5)
  assertEquals(parseOpenTopoData({ results: [{ elevation: null }] }), null)
  assertEquals(parseOpenTopoData({ results: [] }), null)
  assertEquals(parseOpenTopoData(null), null)
})

// ===== (b) provider 切替 =====
Deno.test('getProvider: env で nominatim/opencage/geoapify を切替（既定 nominatim）', () => {
  Deno.env.delete('GEOCODE_PROVIDER')
  assertEquals(getProvider(), 'nominatim')
  Deno.env.set('GEOCODE_PROVIDER', 'opencage')
  assertEquals(getProvider(), 'opencage')
  Deno.env.set('GEOCODE_PROVIDER', 'GEOAPIFY')
  assertEquals(getProvider(), 'geoapify')
  Deno.env.set('GEOCODE_PROVIDER', 'bogus')
  assertEquals(getProvider(), 'nominatim') // 未知値は nominatim にフォールバック
  Deno.env.delete('GEOCODE_PROVIDER')
})

// ===== (b) User-Agent（規約必須・連絡先差し込み）=====
Deno.test('getUserAgent: 既定はアプリ名、連絡先 env があれば付与する（NFR-231-01(b)）', () => {
  Deno.env.delete('GEOCODE_CONTACT_EMAIL')
  assert(getUserAgent().includes('zaridasu/1.0'))
  Deno.env.set('GEOCODE_CONTACT_EMAIL', 'ops@example.com')
  assert(getUserAgent().includes('ops@example.com'))
  Deno.env.delete('GEOCODE_CONTACT_EMAIL')
})

// ===== (d) kill switch =====
Deno.test('isEnrichEnabled: 既定 ON、GEO_ENRICH_ENABLED=false で OFF（AC-07）', () => {
  Deno.env.delete('GEO_ENRICH_ENABLED')
  assertEquals(isEnrichEnabled(), true)
  Deno.env.set('GEO_ENRICH_ENABLED', 'false')
  assertEquals(isEnrichEnabled(), false)
  Deno.env.set('GEO_ENRICH_ENABLED', 'true')
  assertEquals(isEnrichEnabled(), true)
  Deno.env.delete('GEO_ENRICH_ENABLED')
})

// ===== (e) grid key（座標丸め / NFR-231-06）=====
Deno.test('makeGridKey: lat/lng を 3 桁丸め（≒100m）でキー化する', () => {
  assertEquals(makeGridKey(39.7196, 140.1026), '39.720,140.103')
  // 同一グリッドに丸まる 2 点は同じキー（キャッシュヒットの根拠）
  assertEquals(makeGridKey(39.71961, 140.10264), makeGridKey(39.71958, 140.10261))
})
