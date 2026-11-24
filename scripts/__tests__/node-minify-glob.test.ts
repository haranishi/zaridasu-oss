// @vitest-environment node

import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { wildcards } from '@node-minify/utils'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const utilsRequire = createRequire(createRequire(require.resolve('@node-minify/core')).resolve('@node-minify/utils'))
const pluginRequire = createRequire(require.resolve('@next/eslint-plugin-next'))
const adapter = utilsRequire('fast-glob') as {
  globSync: (patterns: string | string[], options: Record<string, unknown>) => string[]
}
let root: string
let relativeRoot: string

const files = ['scripts/app.js', 'scripts/vendor.min.js', 'scripts/site.css', 'scripts/.hidden.js', 'other/extra.js']

describe('node-minify wildcards after removing its fast-glob chain', () => {
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'zaridasu-node-minify-'))
    relativeRoot = relative(process.cwd(), root)
    for (const name of files) {
      const file = join(root, name)
      mkdirSync(join(file, '..'), { recursive: true })
      writeFileSync(file, 'source')
    }
    mkdirSync(join(root, 'scripts/directory.js'))
  })

  afterAll(() => rmSync(root, { recursive: true, force: true }))

  it('loads distinct reviewed adapters from the actual installed consumers', () => {
    expect(realpathSync(utilsRequire.resolve('fast-glob'))).toBe(join(import.meta.dirname, '../../tools/node-minify-glob/index.cjs'))
    expect(utilsRequire('fast-glob/package.json').name).toBe('@zaridasu/node-minify-glob')
    expect(realpathSync(pluginRequire.resolve('fast-glob'))).toBe(join(import.meta.dirname, '../../tools/next-eslint-glob/index.cjs'))
    expect(() => pluginRequire('fast-glob').globSync(['*.js'], { onlyDirectories: true })).toThrow(/only supports/)
    expect(() => utilsRequire.resolve('braces')).toThrow()
  })

  it('expands absolute string and brace patterns as files without hidden entries', () => {
    expect(wildcards(join(root, 'scripts/*.{js,css}')).input?.sort()).toEqual([
      join(root, 'scripts/app.js'), join(root, 'scripts/site.css'), join(root, 'scripts/vendor.min.js'),
    ].sort())
  })

  it('expands arrays and ignores matching files', () => {
    expect(wildcards([join(root, 'scripts/*.js'), join(root, 'other/*.js')], {
      ignore: ['**/*.min.js'],
    }).input?.sort()).toEqual([join(root, 'scripts/app.js'), join(root, 'other/extra.js')].sort())
  })

  it('preserves relative results and absolute ignore patterns', () => {
    expect(wildcards(join(relativeRoot, 'scripts/*.{js,css}'), {
      ignore: [join(root, 'scripts/*.min.js')],
    }).input?.sort()).toEqual([join(relativeRoot, 'scripts/app.js'), join(relativeRoot, 'scripts/site.css')].sort())
  })

  it('handles mixed relative and absolute arrays and negative patterns', () => {
    expect(wildcards([
      join(root, 'scripts/*.js'), join(relativeRoot, 'other/*.js'), `!${join(root, 'scripts/*.min.js')}`,
    ]).input?.sort()).toEqual([join(root, 'scripts/app.js'), join(relativeRoot, 'other/extra.js')].sort())
  })

  it('preserves publicFolder options and the legacy publicFolder string', () => {
    const expected = [join(root, 'scripts/app.js'), join(root, 'other/extra.js')].sort()
    expect(wildcards(['scripts/*.js', 'other/*.js'], { publicFolder: root, ignore: ['**/*.min.js'] }).input?.sort()).toEqual(expected)
    expect(wildcards('scripts/*.css', root).input).toEqual([join(root, 'scripts/site.css')])
    expect(wildcards('scripts/*.css', { publicFolder: relativeRoot }).input).toEqual([join(relativeRoot, 'scripts/site.css')])
  })

  it('preserves consumer behavior for literals and missing files', () => {
    expect(wildcards(join(root, 'scripts/app.js'))).toEqual({})
    expect(wildcards([join(root, 'scripts/app.js')]).input).toEqual([join(root, 'scripts/app.js')])
    expect(wildcards(join(root, 'missing/*.js')).input).toEqual([])
    expect(adapter.globSync(join(root, 'scripts'), { ignore: undefined })).toEqual([])
  })

  it('rejects options outside the reviewed node-minify caller contract', () => {
    expect(() => adapter.globSync('*.js', { onlyDirectories: true })).toThrow(/only supports/)
    expect(() => adapter.globSync('*.js', { ignore: '*.min.js' })).toThrow(/only supports/)
  })

  it('uses the matcher path conversion for the Windows consumer branch', () => {
    const output = execFileSync(process.execPath, ['-e', `
      Object.defineProperty(process, 'platform', { value: 'win32' });
      const adapter = require(process.argv[1]);
      process.stdout.write(adapter.convertPathToPattern('C:\\\\project\\\\assets (copy)\\\\*.js'));
    `, utilsRequire.resolve('fast-glob')], { encoding: 'utf8' })
    expect(output).toBe('C:/project/assets \\(copy\\)/*.js')
  })
})
