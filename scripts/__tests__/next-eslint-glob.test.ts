// @vitest-environment node

import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { Linter } from 'eslint'
import nextPlugin from '@next/eslint-plugin-next'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { getRootDirs } = require(join(dirname(require.resolve('@next/eslint-plugin-next')), 'utils/get-root-dirs.js')) as {
  getRootDirs: (context: { cwd: string; settings: { next?: { rootDir?: string | string[] } } }) => string[]
}
const projectRoot = join(import.meta.dirname, '../..')
let root: string
let web: string
let docs: string

describe('REQ-210: Next.js lint after removing braces', () => {
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'zaridasu-next-eslint-'))
    web = join(root, 'apps/web')
    docs = join(root, 'apps/docs')
    mkdirSync(join(web, 'src/app'), { recursive: true })
    mkdirSync(join(docs, 'pages'), { recursive: true })
    writeFileSync(join(web, 'src/app/page.tsx'), 'export default function Page() { return null }')
    writeFileSync(join(docs, 'pages/contact.tsx'), 'export default function Page() { return null }')
    writeFileSync(join(root, 'apps/file.txt'), 'not a directory')
  })

  afterAll(() => rmSync(root, { recursive: true, force: true }))

  it('does not install the vulnerable braces chain', () => {
    const lock = JSON.parse(readFileSync(join(projectRoot, 'package-lock.json'), 'utf8'))
    const unwanted = Object.keys(lock.packages).filter((path) => /(?:^|\/)node_modules\/(?:braces|micromatch)$/.test(path))
    expect(unwanted).toEqual([])
    const pluginRequire = createRequire(require.resolve('@next/eslint-plugin-next'))
    expect(pluginRequire('fast-glob/package.json').name).toBe('@zaridasu/next-eslint-glob')
    expect(() => pluginRequire.resolve('braces')).toThrow()
  })

  it('keeps the current working directory when rootDir is unspecified', () => {
    expect(getRootDirs({ cwd: root, settings: {} })).toEqual([root])
  })

  it('resolves a literal root and excludes files from wildcard roots', () => {
    expect(getRootDirs({ cwd: root, settings: { next: { rootDir: web } } })).toEqual([web])
    expect(getRootDirs({ cwd: root, settings: { next: { rootDir: join(root, 'apps/*') } } }).sort()).toEqual([docs, web].sort())
  })

  it('supports root arrays, brace patterns, and missing roots', () => {
    expect(getRootDirs({ cwd: root, settings: { next: { rootDir: [docs, web] } } }).sort()).toEqual([docs, web].sort())
    expect(getRootDirs({ cwd: root, settings: { next: { rootDir: join(root, 'apps/{web,docs}') } } }).sort()).toEqual([docs, web].sort())
    expect(getRootDirs({ cwd: root, settings: { next: { rootDir: join(root, 'missing/*') } } })).toEqual([])
  })

  it('preserves relative roots and normalizes backslash patterns', () => {
    const pattern = join(relative(process.cwd(), root), 'apps/*')
    expect(getRootDirs({ cwd: root, settings: { next: { rootDir: pattern } } }).sort())
      .toEqual([relative(process.cwd(), docs), relative(process.cwd(), web)].sort())
    expect(getRootDirs({ cwd: root, settings: { next: { rootDir: web.replaceAll('/', '\\') } } })).toEqual([web])
  })

  it.each(['/', '/contact', 'https://example.com/about'])('preserves internal-link checks for %s', (href) => {
    const messages = new Linter({ cwd: root }).verify(`<a href="${href}">Link</a>`, [{
      files: ['**/*.jsx'],
      languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
      plugins: { '@next/next': nextPlugin },
      settings: { next: { rootDir: join(root, 'apps/*') } },
      rules: { '@next/next/no-html-link-for-pages': 'error' },
    }], { filename: join(root, 'link.jsx') })
    expect(messages.map(({ ruleId }) => ruleId)).toEqual(href.startsWith('https:') ? [] : ['@next/next/no-html-link-for-pages'])
  })
})
