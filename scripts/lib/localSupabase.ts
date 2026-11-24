import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

export type LocalStatus = { API_URL: string; ANON_KEY: string; SERVICE_ROLE_KEY?: string }

export function validateLocalStatus(value: unknown): LocalStatus {
  if (!value || typeof value !== 'object') throw new Error('Local Supabase status is missing')
  const data = value as Record<string, unknown>
  if (typeof data.API_URL !== 'string' || typeof data.ANON_KEY !== 'string') {
    throw new Error('Local Supabase API URL or public key is missing')
  }
  const url = new URL(data.API_URL)
  if (!['http:', 'https:'].includes(url.protocol) ||
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Only a loopback Supabase API is allowed; hosted projects are refused')
  }
  if (!/^[A-Za-z0-9_.-]+$/.test(data.ANON_KEY) || data.ANON_KEY.startsWith('sb_secret_')) {
    throw new Error('Expected a local public key')
  }
  if (data.ANON_KEY.startsWith('eyJ')) {
    const payload = JSON.parse(Buffer.from(data.ANON_KEY.split('.')[1] ?? '', 'base64url').toString())
    if (payload.role !== 'anon') throw new Error('Expected an anon public key')
  } else if (!data.ANON_KEY.startsWith('sb_publishable_')) {
    throw new Error('Expected a publishable public key')
  }
  return {
    API_URL: url.origin,
    ANON_KEY: data.ANON_KEY,
    ...(typeof data.SERVICE_ROLE_KEY === 'string' ? { SERVICE_ROLE_KEY: data.SERVICE_ROLE_KEY } : {}),
  }
}

export function readLocalStatus(root: string): LocalStatus {
  const result = spawnSync('supabase', ['status', '--workdir', join(root, '.local-dev'), '-o', 'json'], { cwd: root, encoding: 'utf8' })
  if (result.error || result.status !== 0) throw new Error('Start the local stack with npm run local:start first')
  let value: unknown
  try { value = JSON.parse(result.stdout) }
  catch { throw new Error('Could not parse local Supabase status') }
  return validateLocalStatus(value)
}

export function writeLocalEnvironment(root: string, value: unknown) {
  const config = validateLocalStatus(value)
  const contents = `NEXT_PUBLIC_SUPABASE_URL=${config.API_URL}\nNEXT_PUBLIC_SUPABASE_ANON_KEY=${config.ANON_KEY}\nNEXT_PUBLIC_APP_URL=http://localhost:3000\n`
  // Exclusive creation protects existing user configuration, including symlinks.
  writeFileSync(join(root, '.env.local'), contents, { flag: 'wx', mode: 0o600 })
}
