import { spawnSync } from 'node:child_process'
import { realpathSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { exportOssSource } from './lib/exportOssSource.mjs'

const root = realpathSync(fileURLToPath(new URL('..', import.meta.url)))
const args = process.argv.slice(2)
if (args.length !== 1) {
  console.error('Usage: npm run oss:export -- /path/to/new-directory')
  process.exit(2)
}
let exported
try {
  const audit = spawnSync(process.execPath, ['scripts/audit-oss-secrets.mjs'], { cwd: root, stdio: 'inherit' })
  if (audit.status !== 0) throw new Error('Source audit failed; no export was created.')
  exported = exportOssSource(root, args[0])
  const finalAudit = spawnSync(process.execPath, ['scripts/audit-oss-secrets.mjs', '--directory', exported.directory], { cwd: root, stdio: 'inherit' })
  if (finalAudit.status !== 0) throw new Error('Export audit failed; the new export was removed.')
  console.log(JSON.stringify(exported, null, 2))
} catch (error) {
  if (exported) rmSync(exported.directory, { recursive: true, force: true })
  console.error(error instanceof Error ? error.message : 'Export did not complete.')
  process.exitCode = 1
}
