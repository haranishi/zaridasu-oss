import { defineCloudflareConfig } from '@opennextjs/cloudflare'
import doQueue from '@opennextjs/cloudflare/overrides/queue/do-queue'
import d1IncrementalCache from './cloudflare/free/d1-incremental-cache'

export default defineCloudflareConfig({ incrementalCache: d1IncrementalCache, queue: doQueue })
