// @vitest-environment node
import { mkdtempSync, readFileSync, writeFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { validateLocalStatus, writeLocalEnvironment } from '../lib/localSupabase'

const local = { API_URL: 'http://127.0.0.1:54321', ANON_KEY: 'sb_publishable_placeholder', SERVICE_ROLE_KEY: 'placeholder-private-key' }

describe('local developer configuration', () => {
  it.each(['https://hosted.supabase.co', 'http://localhost.example.com', 'http://user:pass@localhost', 'http://localhost?redirect=hosted', 'file:///tmp/local'])(
    'refuses a non-local or credential-bearing URL: %s', API_URL => {
      expect(() => validateLocalStatus({ ...local, API_URL })).toThrow()
    },
  )
  it('refuses a service-role JWT in the public environment', () => {
    const header = Buffer.from('{}').toString('base64url')
    const payload = Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')
    expect(() => validateLocalStatus({ ...local, ANON_KEY: `eyJ${header}.${payload}.placeholder` })).toThrow()
  })
  it('writes only public local configuration and never overwrites an existing file', () => {
    const directory = mkdtempSync(join(tmpdir(), 'zaridasu-local-config-'))
    try {
      writeLocalEnvironment(directory, local)
      const path = join(directory, '.env.local')
      expect(readFileSync(path, 'utf8')).toContain('NEXT_PUBLIC_APP_URL=http://localhost:3000')
      expect(readFileSync(path, 'utf8')).not.toContain(local.SERVICE_ROLE_KEY)
      expect(statSync(path).mode & 0o777).toBe(0o600)
      writeFileSync(path, 'existing-user-configuration')
      expect(() => writeLocalEnvironment(directory, local)).toThrow()
      expect(readFileSync(path, 'utf8')).toBe('existing-user-configuration')
    } finally { rmSync(directory, { recursive: true, force: true }) }
  })
})
