import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync, lstatSync, realpathSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = realpathSync(fileURLToPath(new URL('..', import.meta.url)))
const directory = join(root, '.local-dev')
try {
  if (existsSync(directory) && lstatSync(directory).isSymbolicLink()) {
    throw new Error('Refusing a symlinked local development directory')
  }
  // Reuse the CI's ordering, then the approved 2026-10-21 hardening series.
  const migrations = join(root, 'supabase/migrations')
  const hardening = readdirSync(migrations).filter(name => /^2026102112\d{4}_.*\.sql$/.test(name)).sort()
  if (hardening.length !== 7) throw new Error('Review the local hardening migration set before proceeding')
  const reapply = readFileSync(join(root, 'supabase/ci/reapply-after-grants.txt'), 'utf8')
    .split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#') && !hardening.includes(line))
  const schema = [readFileSync(join(root, 'supabase/schema.sql'), 'utf8'),
    ...[...reapply, ...hardening].map(name => readFileSync(join(migrations, name), 'utf8')),
  ].join('\n\n')
  const configuration = readFileSync(join(root, 'supabase/config.toml'), 'utf8')
    .replace(/^project_id = .+$/m, 'project_id = "zaridasu-local"')
  const snapshot = join(directory, 'supabase/migrations/20261113000000_local_schema.sql')
  if (existsSync(snapshot) && readFileSync(snapshot, 'utf8') !== schema) {
    throw new Error('The local schema snapshot changed. Preserve local work and explicitly rebuild the local stack before preparing it again.')
  }
  mkdirSync(join(directory, 'supabase/migrations'), { recursive: true })
  const config = join(directory, 'supabase/config.toml')
  if (existsSync(config) && readFileSync(config, 'utf8') !== configuration) {
    throw new Error('Existing local configuration differs; it was not overwritten')
  }
  writeFileSync(snapshot, schema)
  writeFileSync(config, configuration)
  cpSync(join(root, 'supabase/templates'), join(directory, 'supabase/templates'), { recursive: true })
  console.log('Prepared a local-only snapshot from supabase/schema.sql. Production migration history was not modified.')
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Could not prepare the local stack')
  process.exitCode = 1
}
