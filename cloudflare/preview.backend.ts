import type { PreviewBackendEnv } from './preview/backend-env'
import { syntheticBackend } from './preview/backend.mjs'

export default { fetch: syntheticBackend } satisfies ExportedHandler<PreviewBackendEnv>
