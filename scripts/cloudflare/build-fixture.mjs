import { spawn } from 'node:child_process'
import { mkdir, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { FIXTURE_ENV, MONITORING_PROBE_ENV } from './fixtures.mjs'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))

// An allowlist avoids inheriting actual backend, AI, mail or telemetry credentials.
export function fixtureBuildEnvironment(source = process.env) {
  const env = Object.fromEntries(['PATH', 'HOME', 'LANG', 'LC_ALL', 'SystemRoot']
    .filter(key => source[key] !== undefined).map(key => [key, source[key]]))
  return { ...env, ...FIXTURE_ENV, TMPDIR: path.join(ROOT, '.wrangler/fixture-build/tmp'),
    CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false', CLOUDFLARE_INCLUDE_PROCESS_ENV: 'false' }
}

export async function buildFixture() {
  // Next reads these automatically. Refuse them instead of moving/deleting user files.
  const files = await readdir(ROOT)
  if (files.some(name => (/^\.env(?:\.|$)/.test(name) && name !== '.env.example') || /^\.dev\.vars(?:\.|$)/.test(name))) {
    throw new Error('Fixture build requires a checkout without .env or .dev.vars files. Use an isolated worktree.')
  }
  // Exercise preview suppression with configured (synthetic) IDs, rather than empty values.
  const env = { ...fixtureBuildEnvironment(), ...MONITORING_PROBE_ENV }
  await mkdir(env.TMPDIR, { recursive: true })
  for (const script of ['build:cloudflare', 'dry-run:cloudflare']) {
    await new Promise((resolve, reject) => {
      const child = spawn('npm', ['run', script], { cwd: ROOT, env, stdio: 'inherit' })
      child.once('error', reject)
      child.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`${script} failed (${signal ?? code})`)))
    })
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildFixture()
}
