import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateAssetHeaders } from './asset-headers.mjs'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))

/** This migration candidate is always preview, even under an ambient production environment. */
export function cloudflareBuildEnvironment(source = process.env) {
  return { ...source, ZARIDASU_RUNTIME: 'cloudflare', ZARIDASU_DEPLOYMENT_ENV: 'preview',
    NEXT_PUBLIC_DEPLOYMENT_ENV: 'preview', NEXT_TELEMETRY_DISABLED: '1', WRANGLER_SEND_METRICS: 'false',
    SENTRY_AUTH_TOKEN: '' }
}

export async function buildCloudflare() {
  await new Promise((resolve, reject) => {
    const child = spawn(path.join(ROOT, 'node_modules/.bin/opennextjs-cloudflare'), ['build'], {
      cwd: ROOT, env: cloudflareBuildEnvironment(), stdio: 'inherit',
    })
    child.once('error', reject)
    child.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`Cloudflare build failed (${signal ?? code})`)))
  })
  await generateAssetHeaders()
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildCloudflare()
