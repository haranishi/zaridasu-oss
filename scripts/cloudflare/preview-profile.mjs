import { spawn } from 'node:child_process'
import { copyFile, mkdir, readFile, readdir, writeFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { FIXTURE_ENV } from './fixtures.mjs'
import { OSS_ASSET_REPLACEMENTS } from '../lib/exportOssSource.mjs'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const PRIVATE = path.join(ROOT, '.wrangler/preview-profile')
const NAME = /^zaridasu-[a-z0-9-]+-preview(?:-[a-z0-9-]+)?$/

/** IDs are explicit caller input and are never checked into the public profile. */
export function previewConfigs({ accountId, expectedAccountId, workerName, backendName, bucketName, subdomain, root = ROOT }) {
  if (!/^[a-f0-9]{32}$/.test(accountId ?? '') || accountId !== expectedAccountId) throw new Error('Selected account guard failed')
  if (!NAME.test(workerName ?? '') || !NAME.test(backendName ?? '') || workerName === backendName
    || bucketName !== `${workerName}-cache` || !/^[a-z0-9-]+$/.test(subdomain ?? '')) throw new Error('Invalid isolated resource names')
  const origin = `https://${workerName}.${subdomain}.workers.dev`
  const app = { $schema: path.join(root, 'node_modules/wrangler/config-schema.json'),
    account_id: accountId, name: workerName, main: path.join(root, 'cloudflare/preview.worker.ts'),
    compatibility_date: '2026-11-15', compatibility_flags: ['nodejs_compat', 'global_fetch_strictly_public'],
    workers_dev: true, preview_urls: false, upload_source_maps: false,
    vars: { ZARIDASU_RUNTIME: 'cloudflare', ZARIDASU_DEPLOYMENT_ENV: 'preview', PREVIEW_APP_ORIGIN: origin },
    secrets: { required: ['PREVIEW_ACCESS_SECRET'] },
    assets: { directory: path.join(root, '.open-next/assets'), binding: 'ASSETS',
      html_handling: 'none', not_found_handling: 'none', run_worker_first: true },
    services: [{ binding: 'WORKER_SELF_REFERENCE', service: workerName }, { binding: 'PREVIEW_BACKEND', service: backendName }],
    r2_buckets: [{ binding: 'NEXT_INC_CACHE_R2_BUCKET', bucket_name: bucketName }],
    durable_objects: { bindings: [{ name: 'NEXT_CACHE_DO_QUEUE', class_name: 'DOQueueHandler' }] },
    migrations: [{ tag: 'v1', new_sqlite_classes: ['DOQueueHandler'] }],
    images: { binding: 'IMAGES' }, observability: { enabled: false }, send_metrics: false }
  const backend = { $schema: app.$schema, account_id: accountId, name: backendName,
    main: path.join(root, 'cloudflare/preview.backend.ts'), compatibility_date: app.compatibility_date,
    compatibility_flags: app.compatibility_flags, workers_dev: false, preview_urls: false, upload_source_maps: false,
    vars: { PREVIEW_APP_ORIGIN: origin }, secrets: { required: ['PREVIEW_FIXTURE_SECRET'] },
    assets: { directory: path.join(root, '.wrangler/preview-profile/backend-assets'), binding: 'FIXTURE_ASSETS', run_worker_first: true },
    observability: { enabled: false }, send_metrics: false }
  return { app, backend }
}

export function previewBuildEnvironment(origin, source = process.env) {
  const inherited = Object.fromEntries(['PATH', 'HOME', 'LANG', 'LC_ALL', 'SystemRoot']
    .filter(key => source[key] !== undefined).map(key => [key, source[key]]))
  return { ...inherited, ...FIXTURE_ENV, HOME: path.join(PRIVATE, 'home'), NEXT_PUBLIC_SUPABASE_URL: origin,
    TMPDIR: path.join(PRIVATE, 'tmp'), CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false', CLOUDFLARE_INCLUDE_PROCESS_ENV: 'false' }
}

const run = (args, env) => new Promise((resolve, reject) => {
  const child = spawn(path.join(ROOT, 'node_modules/.bin/wrangler'), args, { cwd: ROOT, env, stdio: 'inherit' })
  child.once('error', reject)
  child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Wrangler ${args[0]} failed (${code})`)))
})

export async function preparePreviewProfile(options) {
  const configs = previewConfigs(options)
  const manifest = JSON.parse(await readFile(path.join(ROOT, 'public/OSS_ASSET_MANIFEST.json'), 'utf8'))
  if (manifest.profile !== 'oss-source-with-licensed-placeholders' || !/^[a-f0-9]{40}$/.test(manifest.source_revision ?? '')
    || JSON.stringify(manifest.replacements) !== JSON.stringify(OSS_ASSET_REPLACEMENTS)) throw new Error('Licensed export profile required')
  for (const item of OSS_ASSET_REPLACEMENTS) {
    const [actual, licensed, notice] = await Promise.all([readFile(path.join(ROOT, item.path)),
      readFile(path.join(ROOT, item.source)), readFile(path.join(ROOT, item.notice))])
    if (!actual.equals(licensed) || notice.length === 0) throw new Error('Licensed replacement or notice mismatch')
  }
  const files = await readdir(ROOT)
  if (files.some(name => (/^\.env(?:\.|$)/.test(name) && name !== '.env.example') || /^\.dev\.vars(?:\.|$)/.test(name))) {
    throw new Error('Preview profile requires an isolated checkout without environment files')
  }
  await mkdir(path.join(PRIVATE, 'backend-assets'), { recursive: true, mode: 0o700 })
  await mkdir(path.join(PRIVATE, 'tmp'), { recursive: true, mode: 0o700 })
  await mkdir(path.join(PRIVATE, 'home'), { recursive: true, mode: 0o700 })
  const assets = ['noto-jp-detector.css', 'noto-cjk-detector.css', 'noto-jp-subset.css', 'noto-jp-subset.ttf',
    '1f99e.svg', 'NotoSansJP-OFL.txt', 'Twemoji-LICENSE-GRAPHICS.txt', 'Leaflet-LICENSE.txt', 'provenance.json']
  for (const asset of assets) await copyFile(path.join(ROOT, 'scripts/cloudflare/assets', asset), path.join(PRIVATE, 'backend-assets', asset))
  await copyFile(path.join(ROOT, 'node_modules/leaflet/dist/images/marker-icon-2x.png'), path.join(PRIVATE, 'backend-assets/marker-icon.png'))
  for (const [name, config] of Object.entries(configs)) {
    await writeFile(path.join(PRIVATE, `${name}.json`), `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 })
  }
  // This temporary empty value is used only for the pre-build type pass. Finalization requires the real Next manifest.
  await writeFile(path.join(PRIVATE, 'revalidation-token.mjs'), 'export const revalidationToken = ""\n', { mode: 0o600 })
  const env = previewBuildEnvironment(configs.app.vars.PREVIEW_APP_ORIGIN)
  await generatePreviewTypes(env)
  return { configs, env, directory: PRIVATE }
}

export async function generatePreviewTypes(env) {
  for (const [name, type] of [['app', 'PreviewEnv'], ['backend', 'PreviewBackendEnv']]) {
    const generated = path.join(PRIVATE, `${name}-env.d.ts`)
    await run(['types', '--config', path.join(PRIVATE, `${name}.json`), '--env-interface', type,
      '--include-runtime=false', '--include-main-module=false', '--strict-vars=true', generated], env)
    // Module-scoped generated interfaces do not merge the two Workers into the normal app Env.
    let contents = await readFile(generated, 'utf8')
    contents = contents.replace(/^\/\/ Generated by Wrangler.*$/m, '// Generated by scripts/cloudflare/preview-profile.mjs using Wrangler types.')
    contents = contents.replaceAll(ROOT + path.sep, '../../')
    contents = contents.replace(/PREVIEW_APP_ORIGIN: [^;]+;/, 'PREVIEW_APP_ORIGIN: string;')
      .replace(/Fetcher \/\* [^*]+\*\//g, 'Fetcher')
    await writeFile(path.join(ROOT, `cloudflare/preview/${name}-env.d.ts`), `${contents}\nexport { ${type} }\n`)
  }
}

export async function finalizePreviewProfile(env) {
  const manifest = JSON.parse(await readFile(path.join(ROOT, '.next/prerender-manifest.json'), 'utf8'))
  const token = manifest.preview?.previewModeId
  if (typeof token !== 'string' || token.length < 32) throw new Error('Missing generated framework ISR token')
  await writeFile(path.join(PRIVATE, 'revalidation-token.mjs'), `export const revalidationToken = ${JSON.stringify(token)}\n`, { mode: 0o600 })
  for (const name of ['backend', 'app']) await run(['deploy', '--config', path.join(PRIVATE, `${name}.json`),
    '--dry-run', '--outdir', path.join(PRIVATE, `${name}-dry-run`)], env)
}


// Explicit commands never create remote resources. Deployment remains a separately reviewed operation.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, settingsFile] = process.argv.slice(2)
  if (command === 'prepare' && settingsFile) {
    if ((await stat(settingsFile)).mode & 0o077) throw new Error('Private settings must have mode 0600')
    await preparePreviewProfile(JSON.parse(await readFile(settingsFile, 'utf8')))
  } else if (['build', 'finalize', 'types', 'verify'].includes(command) && !settingsFile) {
    const app = JSON.parse(await readFile(path.join(PRIVATE, 'app.json'), 'utf8'))
    const env = previewBuildEnvironment(app.vars.PREVIEW_APP_ORIGIN)
    if (command === 'verify') {
      const { chromium } = await import('@playwright/test')
      let install = path.dirname(chromium.executablePath())
      while (!/^chromium[-_]\w*[-]?\d+$/.test(path.basename(install)) && path.dirname(install) !== install) install = path.dirname(install)
      if (path.dirname(install) === install) throw new Error('Cannot locate installed Playwright browser cache')
      env.PLAYWRIGHT_BROWSERS_PATH = path.dirname(install)
    }
    if (command === 'finalize') await finalizePreviewProfile(env)
    if (command === 'types') await generatePreviewTypes(env)
    if (command === 'build' || command === 'verify') await new Promise((resolve, reject) => {
      const args = command === 'build' ? ['run', 'build:cloudflare'] : ['--test',
        'scripts/cloudflare/preview-security.checks.mjs', 'scripts/cloudflare/preview-backend.checks.mjs',
        'scripts/cloudflare/preview-profile.checks.mjs', 'scripts/cloudflare/preview-runtime.mjs']
      const child = spawn(command === 'build' ? 'npm' : process.execPath, args, { cwd: ROOT, env, stdio: 'inherit' })
      child.once('error', reject)
      child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Preview ${command} failed (${code})`)))
    })
  } else throw new Error('Usage: preview-profile.mjs prepare <private-settings.json> | build | finalize | types | verify')
}
