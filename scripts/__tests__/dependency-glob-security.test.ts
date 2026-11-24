// @vitest-environment node

import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ESLint } from 'eslint'
import { clearCaches, parseForESLint } from '@typescript-eslint/parser'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const bundlerRequire = createRequire(import.meta.resolve('@sentry/bundler-plugins/core'))
const { glob } = bundlerRequire('glob') as typeof import('glob')
const projectRoot = join(import.meta.dirname, '../..')
let root: string

describe('REQ-210: patched glob consumers', () => {
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'zaridasu-dependency-glob-'))
    mkdirSync(join(root, 'src'), { recursive: true })
    mkdirSync(join(root, 'ignored'), { recursive: true })
    writeFileSync(join(root, 'src/main.js'), 'export const value = 1')
    writeFileSync(join(root, 'ignored/generated.js'), 'generated')
    writeFileSync(join(root, 'lint-config.ts'), 'export const value: number = 1')
  })

  afterAll(() => {
    clearCaches()
    rmSync(root, { recursive: true, force: true })
  })

  it('excludes both known vulnerable version ranges from every installed lock entry', () => {
    const lock = JSON.parse(readFileSync(join(projectRoot, 'package-lock.json'), 'utf8'))
    const affected = Object.entries(lock.packages as Record<string, { version?: string }>).filter(([path, entry]) => {
      if (!entry.version) return false
      const [major = 0, minor = 0, patch = 0] = entry.version.split('.').map(Number)
      if (path.endsWith('/minimatch')) return major >= 7 && (major < 11 || major === 11 && minor === 0 && patch < 1)
      if (path.endsWith('/glob')) return major >= 9 && (major < 14 || major === 14 && minor === 0 && patch < 2)
      return false
    }).map(([path, { version }]) => ({ path, version }))
    expect(affected).toEqual([])
  })

  it('keeps Sentry bundler file discovery and ignores working with the patched glob', async () => {
    expect(await glob('**/*.js', { cwd: root, nodir: true, ignore: ['ignored/**'] })).toEqual(['src/main.js'])
  })

  it('keeps ESLint file patterns and ignores effective', async () => {
    const eslint = new ESLint({
      cwd: root,
      overrideConfigFile: true,
      overrideConfig: [{ ignores: ['ignored/**'] }, { files: ['**/*.js'], rules: { 'no-unused-vars': 'error' } }],
    })
    expect(await eslint.isPathIgnored(join(root, 'ignored/generated.js'))).toBe(true)
    expect(await eslint.isPathIgnored(join(root, 'src/main.js'))).toBe(false)
    const [result] = await eslint.lintText('const unused = 1', { filePath: 'src/main.js' })
    expect(result?.messages.map(message => message.ruleId)).toEqual(['no-unused-vars'])
  })

  it('keeps TypeScript project-service allowDefaultProject patterns effective', () => {
    const source = readFileSync(join(root, 'lint-config.ts'), 'utf8')
    const options = { filePath: join(root, 'lint-config.ts'), tsconfigRootDir: root, projectService: { allowDefaultProject: ['*.ts'] } }
    expect(parseForESLint(source, options).services.program).toBeTruthy()
    clearCaches()
    expect(() => parseForESLint(source, { ...options, projectService: { allowDefaultProject: ['*.mjs'] } })).toThrow(/allowDefaultProject/)
  })
})
