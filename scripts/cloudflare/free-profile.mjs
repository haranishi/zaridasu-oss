import { spawn } from 'node:child_process'
import { copyFile, mkdir, readFile, readdir, writeFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { FIXTURE_ENV, MONITORING_PROBE_ENV } from './fixtures.mjs'
import { OSS_ASSET_REPLACEMENTS } from '../lib/exportOssSource.mjs'
import { generateAssetHeaders } from './asset-headers.mjs'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
export const FREE_PRIVATE = path.join(ROOT, '.wrangler/free-profile')
const NAME = /^zaridasu-[a-z0-9-]+-preview(?:-[a-z0-9-]+)?$/

/** Local prototype only. Account/Free evidence and remote operations belong to a separate gate. */
export function freeConfigs(options) {
  const { accountId, expectedAccountId, workerName, rendererName, backendName, databaseName, databaseId,
    localDatabaseIdOnly, subdomain, mode, freeAccountVerified, root = ROOT } = options
  if (!/^[a-f0-9]{32}$/.test(accountId ?? '') || accountId !== expectedAccountId) throw new Error('Selected account guard failed')
  if (![workerName, rendererName, backendName].every(name => NAME.test(name ?? ''))
    || new Set([workerName, rendererName, backendName]).size !== 3 || databaseName !== `${workerName}-cache`
    || !/^[a-z0-9-]+$/.test(subdomain ?? '')) throw new Error('Invalid isolated resource names')
  if (mode !== 'local-prototype' || localDatabaseIdOnly !== true || freeAccountVerified !== false
    || !/^00000000-0000-4000-8000-\d{12}$/.test(databaseId ?? '')) throw new Error('Only explicit local dummy resource IDs are supported')
  const origin = `https://${workerName}.${subdomain}.workers.dev`
  const shared = { $schema: path.join(root, 'node_modules/wrangler/config-schema.json'), account_id: accountId,
    compatibility_date: '2026-11-16', compatibility_flags: ['nodejs_compat', 'global_fetch_strictly_public'],
    preview_urls: false, upload_source_maps: false, observability: { enabled: false }, send_metrics: false }
  const assets = { directory: path.join(root, '.open-next/assets'), binding: 'ASSETS', html_handling: 'none',
    not_found_handling: 'none', run_worker_first: true }
  const backendService = { binding: 'PREVIEW_BACKEND', service: backendName }
  const vars = { ZARIDASU_RUNTIME: 'cloudflare', ZARIDASU_DEPLOYMENT_ENV: 'preview', PREVIEW_APP_ORIGIN: origin }
  const ingress = { ...shared, name: workerName, main: path.join(root, 'cloudflare/free.ingress.ts'), workers_dev: true,
    vars, assets, secrets: { required: ['PREVIEW_ACCESS_SECRET', 'PREVIEW_FORWARD_SECRET'] }, services: [backendService],
    durable_objects: { bindings: [{ name: 'RENDERER', class_name: 'RenderHandler', script_name: rendererName }] } }
  const renderer = { ...shared, name: rendererName, main: path.join(root, 'cloudflare/free.renderer.ts'), workers_dev: false,
    vars: { ...vars, NEXT_INC_CACHE_D1_PREFIX: 'free-preview-cache' }, assets,
    secrets: { required: ['PREVIEW_FORWARD_SECRET'] },
    services: [{ binding: 'WORKER_SELF_REFERENCE', service: workerName }, backendService],
    d1_databases: [{ binding: 'NEXT_INC_CACHE_D1', database_name: databaseName, database_id: databaseId,
      migrations_dir: path.join(root, 'cloudflare/free') }],
    durable_objects: { bindings: [{ name: 'NEXT_CACHE_DO_QUEUE', class_name: 'DOQueueHandler' }] },
    migrations: [{ tag: 'v1', new_sqlite_classes: ['RenderHandler', 'DOQueueHandler'] }], images: { binding: 'IMAGES' } }
  const backend = { ...shared, name: backendName, main: path.join(root, 'cloudflare/preview.backend.ts'), workers_dev: false,
    vars: { PREVIEW_APP_ORIGIN: origin }, secrets: { required: ['PREVIEW_FIXTURE_SECRET'] },
    assets: { directory: path.join(root, '.wrangler/free-profile/backend-assets'), binding: 'FIXTURE_ASSETS', run_worker_first: true } }
  return { ingress, renderer, backend }
}

export function freeBuildEnvironment(origin, source = process.env) {
  const inherited = Object.fromEntries(['PATH', 'LANG', 'LC_ALL', 'SystemRoot']
    .filter(key => source[key] !== undefined).map(key => [key, source[key]]))
  return { ...inherited, ...FIXTURE_ENV, ...MONITORING_PROBE_ENV, NEXT_PUBLIC_SUPABASE_URL: origin,
    HOME: path.join(FREE_PRIVATE, 'home'), TMPDIR: path.join(FREE_PRIVATE, 'tmp'),
    CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false', CLOUDFLARE_INCLUDE_PROCESS_ENV: 'false' }
}

export function localCommand(bin, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd: ROOT, env, stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Local ${path.basename(bin)} ${args[0]} failed (${code})`)))
  })
}
const wrangler = (args, env) => localCommand(path.join(ROOT, 'node_modules/.bin/wrangler'), args, env)

export async function prepareFreeProfile(options) {
  const configs = freeConfigs(options)
  const manifest = JSON.parse(await readFile(path.join(ROOT, 'public/OSS_ASSET_MANIFEST.json'), 'utf8'))
  if (manifest.profile !== 'oss-source-with-licensed-placeholders' || !/^[a-f0-9]{40}$/.test(manifest.source_revision ?? '')
    || JSON.stringify(manifest.replacements) !== JSON.stringify(OSS_ASSET_REPLACEMENTS)) throw new Error('Licensed immutable export required')
  for (const item of OSS_ASSET_REPLACEMENTS) {
    const [actual, source, notice] = await Promise.all([readFile(path.join(ROOT, item.path)),
      readFile(path.join(ROOT, item.source)), readFile(path.join(ROOT, item.notice))])
    if (!actual.equals(source) || notice.length === 0) throw new Error('Licensed replacement mismatch')
  }
  if ((await readdir(ROOT)).some(name => (/^\.env(?:\.|$)/.test(name) && name !== '.env.example') || /^\.dev\.vars(?:\.|$)/.test(name))) {
    throw new Error('Free profile requires an isolated source without environment files')
  }
  for (const dir of ['backend-assets', 'home', 'tmp']) await mkdir(path.join(FREE_PRIVATE, dir), { recursive: true, mode: 0o700 })
  for (const asset of ['noto-jp-detector.css', 'noto-cjk-detector.css', 'noto-jp-subset.css', 'noto-jp-subset.ttf',
    '1f99e.svg', 'NotoSansJP-OFL.txt', 'Twemoji-LICENSE-GRAPHICS.txt', 'Leaflet-LICENSE.txt', 'provenance.json']) {
    await copyFile(path.join(ROOT, 'scripts/cloudflare/assets', asset), path.join(FREE_PRIVATE, 'backend-assets', asset))
  }
  await copyFile(path.join(ROOT, 'node_modules/leaflet/dist/images/marker-icon-2x.png'), path.join(FREE_PRIVATE, 'backend-assets/marker-icon.png'))
  for (const [name, config] of Object.entries(configs)) await writeFile(path.join(FREE_PRIVATE, `${name}.json`), `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 })
  await writeFile(path.join(FREE_PRIVATE, 'local-only.json'), JSON.stringify({ mode: 'local-prototype', localDatabaseIdOnly: true,
    freeAccountVerified: false, remoteCpuVerified: false }), { mode: 0o600 })
  await writeFile(path.join(FREE_PRIVATE, 'revalidation-token.mjs'), 'export const revalidationToken = ""\n', { mode: 0o600 })
  const env = freeBuildEnvironment(configs.ingress.vars.PREVIEW_APP_ORIGIN)
  await generateFreeTypes(env)
  return { configs, env }
}

export async function generateFreeTypes(env) {
  for (const [name, type] of [['ingress', 'FreeIngressEnv'], ['renderer', 'FreeRendererEnv'], ['backend', 'FreeBackendEnv']]) {
    const output = path.join(FREE_PRIVATE, `${name}-env.d.ts`)
    await wrangler(['types', '--config', path.join(FREE_PRIVATE, `${name}.json`), '--env-interface', type,
      '--include-runtime=false', '--include-main-module=false', '--strict-vars=true', output], env)
    let contents = await readFile(output, 'utf8')
    contents = contents.replace(/^\/\/ Generated by Wrangler.*$/m, '// Generated by the local Free profile with Wrangler types.')
      .replaceAll(ROOT + path.sep, '../../').replace(/PREVIEW_APP_ORIGIN: [^;]+;/, 'PREVIEW_APP_ORIGIN: string;')
      .replace(/Fetcher \/\* [^*]+\*\//g, 'Fetcher').replace(/DurableObjectNamespace \/\* [^*]+\*\//g, 'DurableObjectNamespace')
    await writeFile(path.join(ROOT, `cloudflare/free/${name}-env.d.ts`), `${contents}\nexport { ${type} }\n`)
  }
}

export async function buildFreeProfile(env) {
  await localCommand(path.join(ROOT, 'node_modules/.bin/opennextjs-cloudflare'), ['build',
    '--openNextConfigPath', 'open-next.free.config.ts', '-c', path.join(FREE_PRIVATE, 'renderer.json')], env)
  await generateAssetHeaders()
}

export async function finalizeFreeProfile(env) {
  const manifest = JSON.parse(await readFile(path.join(ROOT, '.next/prerender-manifest.json'), 'utf8'))
  const token = manifest.preview?.previewModeId
  if (typeof token !== 'string' || token.length < 32) throw new Error('Missing generated framework ISR token')
  await writeFile(path.join(FREE_PRIVATE, 'revalidation-token.mjs'), `export const revalidationToken = ${JSON.stringify(token)}\n`, { mode: 0o600 })
  for (const name of ['backend', 'renderer', 'ingress']) {
    const directory = path.join(FREE_PRIVATE, `${name}-dry-run`)
    await wrangler(['deploy', '--config', path.join(FREE_PRIVATE, `${name}.json`), '--dry-run', '--outdir', directory,
      '--outfile', path.join(directory, 'multipart.bundle')], env)
  }
  await writeFile(path.join(FREE_PRIVATE, 'finalized.json'), JSON.stringify({ buildComplete: true, freeAccountVerified: false,
    remoteCpuVerified: false }), { mode: 0o600 })
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, settingsFile, ...extra] = process.argv.slice(2)
  if (command === 'prepare' && settingsFile && extra.length === 0) {
    if ((await stat(settingsFile)).mode & 0o077) throw new Error('Local settings must be private (0600)')
    await prepareFreeProfile(JSON.parse(await readFile(settingsFile, 'utf8')))
  } else if (['build', 'finalize', 'types', 'verify'].includes(command) && !settingsFile) {
    const ingress = JSON.parse(await readFile(path.join(FREE_PRIVATE, 'ingress.json'), 'utf8'))
    const env = freeBuildEnvironment(ingress.vars.PREVIEW_APP_ORIGIN)
    if (command === 'types') await generateFreeTypes(env)
    if (command === 'build') await buildFreeProfile(env)
    if (command === 'finalize') await finalizeFreeProfile(env)
    if (command === 'verify') {
      await stat(path.join(FREE_PRIVATE, 'finalized.json'))
      const { chromium } = await import('@playwright/test')
      let install = path.dirname(chromium.executablePath())
      while (!/^chromium[-_]\w*[-]?\d+$/.test(path.basename(install)) && path.dirname(install) !== install) install = path.dirname(install)
      if (path.dirname(install) === install) throw new Error('Cannot locate installed Playwright browser')
      env.PLAYWRIGHT_BROWSERS_PATH = path.dirname(install)
      await localCommand(process.execPath, ['--test', 'scripts/cloudflare/free-runtime.mjs'], env)
    }
  } else throw new Error('Usage: free-profile.mjs prepare <private-settings.json> | build | finalize | types | verify (local only)')
}
