import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { D1Database } from '@cloudflare/workers-types'
import type { IncrementalCache } from '@opennextjs/aws/types/overrides.js'
import { createD1Cache } from './d1-cache.mjs'

type CacheEnvironment = CloudflareEnv & {
  NEXT_INC_CACHE_D1?: D1Database
  NEXT_INC_CACHE_D1_PREFIX?: string
}

const cache: IncrementalCache = createD1Cache(
  () => (getCloudflareContext().env as CacheEnvironment).NEXT_INC_CACHE_D1,
  { getKeyOptions: () => ({
    prefix: (getCloudflareContext().env as CacheEnvironment).NEXT_INC_CACHE_D1_PREFIX,
    buildId: process.env.OPEN_NEXT_BUILD_ID,
  }) },
)

export default cache
