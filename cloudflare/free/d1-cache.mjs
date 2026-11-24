import { computeCacheKey } from '@opennextjs/cloudflare/overrides/internal'

export const MAX_VALUE_BYTES = 1_048_576
const MAX_KEY_BYTES = 8192
const encoder = new TextEncoder()
const messages = {
  MISSING_BINDING: 'D1 cache binding is unavailable.',
  INVALID_INPUT: 'D1 cache input is invalid.',
  VALUE_TOO_LARGE: 'D1 cache JSON exceeds the 1 MiB limit.',
  INVALID_ENTRY: 'D1 cache entry is invalid.',
  STORAGE_FAILURE: 'D1 cache storage operation failed.',
}
const SELECT = 'SELECT value_json, last_modified FROM opennext_cache WHERE cache_key = ?'
const UPSERT = `INSERT INTO opennext_cache (cache_key, value_json, last_modified) VALUES (?, ?, ?)
  ON CONFLICT(cache_key) DO UPDATE SET value_json = excluded.value_json, last_modified = excluded.last_modified`
const DELETE = 'DELETE FROM opennext_cache WHERE cache_key = ?'

export class D1CacheError extends Error {
  /** @param {keyof typeof messages} code */
  constructor(code) {
    super(messages[code])
    this.name = 'D1CacheError'
    this.code = code
  }
}

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const isTimestamp = value => Number.isSafeInteger(value) && value >= 0

/** Reject instead of exposing D1's SQL, bound values, or nested exception cause. */
async function storageOperation(operation) {
  try { return await operation() } catch (error) {
    if (error instanceof D1CacheError) throw error
    throw new D1CacheError('STORAGE_FAILURE')
  }
}

function valueSize(serialized) {
  if (serialized.length > MAX_VALUE_BYTES || encoder.encode(serialized).byteLength > MAX_VALUE_BYTES) throw new D1CacheError('VALUE_TOO_LARGE')
}

function serialize(value) {
  if (!isObject(value)) throw new D1CacheError('INVALID_INPUT')
  let serialized
  try { serialized = JSON.stringify(value) } catch { throw new D1CacheError('INVALID_INPUT') }
  // A user-defined toJSON can change the root type or remove the value entirely.
  if (typeof serialized !== 'string' || !serialized.startsWith('{')) throw new D1CacheError('INVALID_INPUT')
  valueSize(serialized)
  return serialized
}

function deserialize(serialized) {
  if (typeof serialized !== 'string') throw new D1CacheError('INVALID_ENTRY')
  valueSize(serialized)
  let value
  try { value = JSON.parse(serialized) } catch { throw new D1CacheError('INVALID_ENTRY') }
  if (!isObject(value)) throw new D1CacheError('INVALID_ENTRY')
  return value
}

/**
 * The binding and key configuration are resolved per operation, never at import time.
 * Schema application is an explicit deployment step, outside this cache adapter.
 * @param {() => import('@cloudflare/workers-types').D1Database | undefined | Promise<import('@cloudflare/workers-types').D1Database | undefined>} getDatabase
 * @param {{getKeyOptions?: () => {prefix?: string, buildId?: string}, now?: () => number}} [options]
 */
export function createD1Cache(getDatabase, { getKeyOptions = () => ({}), now = Date.now } = {}) {
  async function binding() {
    let database
    try { database = await getDatabase() } catch { throw new D1CacheError('MISSING_BINDING') }
    if (!database || typeof database.prepare !== 'function' || typeof database.withSession !== 'function') {
      throw new D1CacheError('MISSING_BINDING')
    }
    return database
  }

  function cacheKey(key, cacheType) {
    if (typeof key !== 'string' || key.length === 0 || key.length > MAX_KEY_BYTES || encoder.encode(key).byteLength > MAX_KEY_BYTES
      || !['cache', 'fetch', 'composable'].includes(cacheType)) throw new D1CacheError('INVALID_INPUT')
    let options
    try { options = getKeyOptions() } catch { throw new D1CacheError('INVALID_INPUT') }
    if (!isObject(options)) throw new D1CacheError('INVALID_INPUT')
    const { prefix, buildId } = options
    // Canonical build IDs and prefix segments prevent computeCacheKey's slash
    // normalization from aliasing distinct configured namespaces; bounds cap row size.
    if (buildId !== undefined && (typeof buildId !== 'string' || !/^[A-Za-z0-9._-]{1,256}$/.test(buildId))) {
      throw new D1CacheError('INVALID_INPUT')
    }
    if (prefix !== undefined && (typeof prefix !== 'string' || prefix.length > 1024 || encoder.encode(prefix).byteLength > 1024
      || !/^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/.test(prefix))) throw new D1CacheError('INVALID_INPUT')
    return computeCacheKey(key, { prefix, buildId, cacheType })
  }

  return {
    name: 'cf-d1-incremental-cache',
    async get(key, cacheType = 'cache') {
      return storageOperation(async () => {
        const database = await binding()
        const row = await database.withSession('first-primary').prepare(SELECT).bind(cacheKey(key, cacheType)).first()
        if (row === null) return null
        if (!isObject(row) || !isTimestamp(row.last_modified)) throw new D1CacheError('INVALID_ENTRY')
        return { value: deserialize(row.value_json), lastModified: row.last_modified }
      })
    },
    async set(key, value, cacheType = 'cache') {
      return storageOperation(async () => {
        const database = await binding()
        const id = cacheKey(key, cacheType)
        const serialized = serialize(value)
        const timestamp = now()
        if (!isTimestamp(timestamp)) throw new D1CacheError('INVALID_INPUT')
        // One statement commits the matching JSON and timestamp together.
        const result = await database.prepare(UPSERT).bind(id, serialized, timestamp).run()
        if (result?.success !== true) throw new D1CacheError('STORAGE_FAILURE')
      })
    },
    async delete(key) {
      return storageOperation(async () => {
        const database = await binding()
        // OpenNext delete invalidates only ISR/SSG (.cache); other types stay separate.
        const result = await database.prepare(DELETE).bind(cacheKey(key, 'cache')).run()
        if (result?.success !== true) throw new D1CacheError('STORAGE_FAILURE')
      })
    },
  }
}
