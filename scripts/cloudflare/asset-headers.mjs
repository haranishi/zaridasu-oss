import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

/** Reuse the actual built Next policy so CSP origins and security headers cannot drift. */
export async function generateAssetHeaders() {
  const manifest = JSON.parse(await readFile(new URL('../../.next/routes-manifest.json', import.meta.url), 'utf8'))
  const patterns = new Set()
  const rules = manifest.headers.map(({ source, headers, has, missing }) => {
    const pattern = source === '/(.*)' ? '/*' : source.replace(/\/:path\*$/, '/*')
    if (has?.length || missing?.length || /[:(){}?+]/.test(pattern)) {
      throw new Error(`Unsupported conditional Next asset header rule: ${source}`)
    }
    // Cloudflare stores rules by path; a second identical pattern silently replaces the first.
    if (patterns.has(pattern)) throw new Error(`Duplicate Cloudflare asset header pattern: ${pattern}`)
    patterns.add(pattern)
    const values = pattern === '/*' ? [...headers, { key: 'X-Robots-Tag', value: 'noindex, nofollow' }] : headers
    return [pattern, ...values.map(({ key, value }) => `  ${key}: ${value}`)].join('\n')
  })
  if (!patterns.has('/*')) throw new Error('Missing global Next security header rule')
  const contents = ['# Generated from .next/routes-manifest.json by scripts/cloudflare/asset-headers.mjs',
    ...rules,
    // Next sets this framework header internally, outside the custom headers manifest.
    '/_next/static/*\n  Cache-Control: public, max-age=31536000, immutable', ''].join('\n\n')
  if (contents.split('\n').some(line => line.length > 2000)) throw new Error('Cloudflare asset header line exceeds 2000 characters')
  await writeFile(new URL('../../.open-next/assets/_headers', import.meta.url), contents)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await generateAssetHeaders()
