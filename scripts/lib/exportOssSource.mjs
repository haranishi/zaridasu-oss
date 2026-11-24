import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'

// A reserved host (RFC 2606) that can never resolve. It replaces live destinations in the public copy.
export const OSS_UNCONFIGURED_BACKEND_URL = 'https://project-not-configured.invalid'
export const OSS_PRIVATE_LINK_PLACEHOLDER = '#private-link-removed'

// Rewrites touch the exported copy only. The private repository keeps its real values.
// The patterns are written with escapes so this file never contains the strings the guard looks for.
export const OSS_REWRITE_RULES = [
  {
    name: 'backend-project-url',
    applies: path => path.startsWith('supabase/') && path.endsWith('.sql'),
    pattern: /https:\/\/[a-z0-9]{20}\.supabase\.co(?![A-Za-z0-9-])/gi,
    replacement: OSS_UNCONFIGURED_BACKEND_URL,
  },
  {
    name: 'live-form-endpoint',
    applies: path => /^src\/.*\.(?:ts|tsx)$/.test(path),
    pattern: /https:\/\/(?:script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/(?:exec|dev)|forms\.gle\/[A-Za-z0-9]+|docs\.google\.com\/forms\/d\/e\/[A-Za-z0-9_-]+\/viewform)/g,
    replacement: OSS_UNCONFIGURED_BACKEND_URL + '/form',
  },
  {
    name: 'private-document-link',
    applies: path => /\.(?:md|json)$/.test(path) && path !== 'package-lock.json',
    pattern: /https:\/\/(?:www\.figma\.com\/(?:design|file|proto|board)\/|drive\.google\.com\/(?:drive\/folders|file\/d)\/|docs\.google\.com\/(?:document|spreadsheets|forms)\/d\/)[^\s)"'<>\]]+/g,
    replacement: OSS_PRIVATE_LINK_PLACEHOLDER,
  },
]
// What no rewrite rule may leave behind. Matching any file type means a new place needs its own rule.
const LIVE_DESTINATION = /https:\/\/(?:script\.google\.com\/macros\/s\/|forms\.gle\/|docs\.google\.com\/(?:forms|document|spreadsheets)\/d\/|drive\.google\.com\/(?:drive\/folders|file\/d)\/|www\.figma\.com\/(?:design|file|proto|board)\/)/
// Consumer mail providers, Japanese carriers and academic domains identify a person, not a project role.
// Best effort: an address on a personal domain cannot be recognised by its shape.
export const OSS_PERSONAL_ADDRESS = new RegExp('[A-Za-z0-9._%+-]+@(?:' + [
  'gmail\\.com', 'googlemail\\.com', 'icloud\\.com', 'me\\.com', 'mac\\.com', 'ymail\\.com', 'msn\\.com', 'aol\\.com',
  'pm\\.me', 'proton\\.me', 'protonmail\\.(?:com|ch)', 'yahoo\\.(?:com|co\\.jp|ne\\.jp)', 'outlook\\.(?:com|jp|co\\.jp)',
  'hotmail\\.(?:com|co\\.jp|co\\.uk)', 'live\\.(?:com|jp)', 'au\\.com', 'docomo\\.ne\\.jp', 'ezweb\\.ne\\.jp',
  '(?:i\\.)?softbank\\.(?:ne\\.)?jp', 'nifty\\.com', 'biglobe\\.ne\\.jp', 'ocn\\.ne\\.jp', 'so-net\\.ne\\.jp',
  '[A-Za-z0-9.-]+\\.(?:ac\\.jp|ed\\.jp|ac\\.uk|edu)',
].join('|') + ')(?![A-Za-z0-9-])', 'i')

const home = ['bullfrog', 'canal', 'crayfish', 'phone', 'pond', 'waterside']
export const OSS_ASSET_REPLACEMENTS = [
  ...['american', 'bullfrog'].map(name => ({
    path: 'public/images/' + name + '.png',
    source: 'public/images/leaflet/marker-icon-2x.png',
    license: 'BSD-2-Clause',
    notice: 'public/images/leaflet/LICENSE',
  })),
  ...home.map(name => ({
    path: 'public/images/home/' + name + '-v2.webp',
    source: 'public/lp/hero.webp',
    license: 'MIT',
    notice: 'LICENSE',
  })),
]

function rejectSymlinks(directory) {
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    if (item.isSymbolicLink()) throw new Error('Source archives must not contain symbolic links.')
    if (item.isDirectory()) rejectSymlinks(join(directory, item.name))
  }
}

function listFiles(directory, found = []) {
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, item.name)
    if (item.isDirectory()) listFiles(path, found)
    else if (item.isFile()) found.push(path)
  }
  return found
}

// A fork that keeps a live URL as its default would send requests, forms, or readers to the live service.
function rewriteLiveReferences(target) {
  const rewritten = Object.fromEntries(OSS_REWRITE_RULES.map(rule => [rule.name, []]))
  for (const path of listFiles(target)) {
    const name = relative(target, path).split(sep).join('/')
    const rules = OSS_REWRITE_RULES.filter(rule => rule.applies(name))
    if (!rules.length) continue
    const original = readFileSync(path, 'utf8')
    let text = original
    for (const rule of rules) {
      const next = text.replace(rule.pattern, rule.replacement)
      if (next === text) continue
      rewritten[rule.name].push(name)
      text = next
    }
    if (text !== original) writeFileSync(path, text)
  }
  for (const files of Object.values(rewritten)) files.sort()
  return rewritten
}

// Binary files are read as Latin-1 so ASCII text inside metadata is still seen.
// Text is normalised (NFKC) so full-width characters cannot hide an address.
function scannableText(path) {
  const buffer = readFileSync(path)
  return buffer.includes(0) ? buffer.toString('latin1') : buffer.toString('utf8').normalize('NFKC')
}

// Names the files only: a matched value is never printed, so logs do not repeat it.
function assertNoPrivateReferences(target) {
  const personal = []
  const live = []
  for (const path of listFiles(target)) {
    const text = scannableText(path)
    const name = relative(target, path).split(sep).join('/')
    if (OSS_PERSONAL_ADDRESS.test(text)) personal.push(name)
    if (LIVE_DESTINATION.test(text)) live.push(name)
  }
  const problems = []
  if (personal.length) problems.push('Personal contact addresses were found in: ' + personal.sort().join(', '))
  if (live.length) problems.push('Live survey, form, or private document links were found in: ' + live.sort().join(', '))
  if (problems.length) throw new Error(problems.join('. ') + '. Remove them, add a rewrite rule, or exclude the files before exporting.')
}

export function exportOssSource(repository, output) {
  const root = realpathSync(repository)
  const target = resolve(realpathSync(dirname(resolve(output))), basename(resolve(output)))
  const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: root, encoding: 'utf8' })
  if (dirty.trim()) throw new Error('Commit or remove the source changes before exporting HEAD.')
  if (existsSync(target)) throw new Error('The export destination already exists; nothing was overwritten.')
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
  const archive = execFileSync('git', ['archive', '--format=tar', 'HEAD'], { cwd: root, maxBuffer: 128 * 1024 * 1024 })
  mkdirSync(target, { mode: 0o700 })
  try {
    execFileSync('tar', ['-xf', '-', '-C', target], { input: archive, stdio: ['pipe', 'pipe', 'pipe'] })
    rejectSymlinks(target)
    for (const item of OSS_ASSET_REPLACEMENTS) {
      const source = join(target, item.source)
      if (!lstatSync(source).isFile() || !lstatSync(join(target, item.notice)).isFile()) {
        throw new Error('A licensed replacement or its notice is missing.')
      }
      mkdirSync(dirname(join(target, item.path)), { recursive: true })
      copyFileSync(source, join(target, item.path))
    }
    const attributes = join(target, '.gitattributes')
    if (existsSync(attributes)) {
      const excluded = new Set(OSS_ASSET_REPLACEMENTS.map(item => '/' + item.path + ' export-ignore'))
      const lines = readFileSync(attributes, 'utf8').split('\n').filter(line => !excluded.has(line))
      writeFileSync(attributes, lines.join('\n'))
    }
    const rewritten = rewriteLiveReferences(target)
    assertNoPrivateReferences(target)
    const manifest = {
      profile: 'oss-source-with-licensed-placeholders',
      source_revision: revision,
      replacements: OSS_ASSET_REPLACEMENTS,
      rewritten_references: rewritten,
      note: 'These generic placeholders replace private or unverified artwork. They are not species illustrations or observation records.',
    }
    writeFileSync(join(target, 'public/OSS_ASSET_MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n')
    writeFileSync(join(target, 'public/images/home/README.md'), [
      '# 公開用sourceの代替画像',
      '',
      'この6画像は同梱LP図（public/lp/hero.webp、MIT）のコピーです。',
      '稼働中サービスの写真風素材は再配布権限を確認中のため含めていません。',
      '生息地・観察・参加者の実記録を示す画像ではありません。',
      '出所と条件はpublic/OSS_ASSET_MANIFEST.jsonを参照してください。',
      '',
    ].join('\n'))
    const notices = join(target, 'THIRD_PARTY_NOTICES.md')
    if (existsSync(notices) && !readFileSync(notices, 'utf8').includes('## この公開用sourceに含まれる代替素材')) {
      writeFileSync(notices, readFileSync(notices, 'utf8') + [
        '',
        '## この公開用sourceに含まれる代替素材',
        '',
        'この配布物のamerican.pngとbullfrog.pngはLeafletマーカーのコピー（BSD-2-Clause）です。生きもののイラストではありません。',
        'ホーム6画像は同梱LP図のコピー（MIT）です。元の写真風画像ではありません。',
        '上記の確認待ち事項は、ここに同梱していない原画像についてのものです。',
        '対応する出所とライセンス全文はpublic/OSS_ASSET_MANIFEST.jsonの参照先で確認できます。',
        '',
      ].join('\n'))
    }
    const rewrittenFiles = Object.values(rewritten).reduce((sum, files) => sum + files.length, 0)
    return { directory: target, revision, replaced: OSS_ASSET_REPLACEMENTS.length, rewritten: rewrittenFiles }
  } catch (error) {
    rmSync(target, { recursive: true, force: true })
    throw error
  }
}
