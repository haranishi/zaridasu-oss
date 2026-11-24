// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  exportOssSource,
  OSS_ASSET_REPLACEMENTS,
  OSS_PERSONAL_ADDRESS,
  OSS_PRIVATE_LINK_PLACEHOLDER,
  OSS_UNCONFIGURED_BACKEND_URL,
} from '../lib/exportOssSource.mjs'

const SQL_FIXTURE = 'supabase/migrations/20260101000000_notify.sql'
const PROJECT_HOST = 'abcdefghijklmnopqrst.supabase.co'
// Built at runtime so this test file does not trip the guards it verifies.
const FORM_URL = 'https://forms' + '.gle/AbCdEf123'
const SCRIPT_URL = 'https://script' + '.google.com/macros/s/AKfycbFixture_ID-1/exec'
const FIGMA_URL = 'https://www.figma' + '.com/design/FixtureFileKey/Name?node-id=1-2'
const FOLDER_URL = 'https://drive.google' + '.com/drive/folders/FixtureFolderId'

const temporary: string[] = []
afterEach(() => temporary.splice(0).forEach(path => rmSync(path, { recursive: true, force: true })))

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'zaridasu-oss-export-test-'))
  temporary.push(directory)
  const root = join(directory, 'repo')
  const output = join(directory, 'export')
  mkdirSync(root)
  const put = (path: string, text: string) => {
    const target = join(root, path)
    mkdirSync(target.slice(0, target.lastIndexOf('/')), { recursive: true })
    writeFileSync(target, text)
  }
  put('LICENSE', 'MIT fixture')
  put('THIRD_PARTY_NOTICES.md', 'Existing notice\n')
  put('public/images/home/README.md', 'PRIVATE_ORIGINAL_NOTE')
  put('public/images/leaflet/LICENSE', 'BSD fixture')
  put('public/images/leaflet/marker-icon-2x.png', 'LICENSED_MARKER')
  put('public/lp/hero.webp', 'LICENSED_HERO')
  for (const item of OSS_ASSET_REPLACEMENTS) put(item.path, 'PRIVATE_ARTWORK')
  put('.github/workflows/production.yml', 'PRIVATE_AUTOMATION')
  put('.gitignore', '.env.local\n')
  put('scripts/monitor-survey/Code.gs', 'PRIVATE_SURVEY_TOOL')
  put('.kiro/specs/monitor-survey-gas/spec.json', '{}')
  put(SQL_FIXTURE, "v_url := 'https://" + PROJECT_HOST + "';\nPERFORM net.http_post(url := v_url || '/functions/v1/notify');\n")
  put('docs/runbook.md', 'Project https://' + PROJECT_HOST + ' is described here.\n')
  put('src/lib/constants.ts', "export const FEEDBACK_FORM_URL = '" + FORM_URL + "'\nexport const MONITOR_SURVEY_URL = '" + SCRIPT_URL + "'\n")
  put('docs/design.md', 'Source: [Figma](' + FIGMA_URL + ') and [assets](' + FOLDER_URL + ')\n')
  put('.kiro/specs/demo/spec.json', JSON.stringify({ figma_file_url: FIGMA_URL }) + '\n')
  put('.gitattributes', OSS_ASSET_REPLACEMENTS.map(item => '/' + item.path + ' export-ignore').join('\n') + '\n/.github/workflows/production.yml export-ignore\n/scripts/monitor-survey export-ignore\n/.kiro/specs/monitor-survey-gas export-ignore\n')
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, stdio: 'pipe' })
  git('init', '-q')
  git('config', 'user.name', 'Export fixture')
  git('config', 'user.email', 'export@example.test')
  git('config', 'commit.gpgsign', 'false')
  git('add', '.')
  git('commit', '-qm', 'fixture')
  put('.env.local', 'IGNORED_LOCAL_SETTING')
  return { root, output, directory, git, put }
}

function exportError(root: string, output: string) {
  try {
    exportOssSource(root, output)
  } catch (error) {
    return String(error)
  }
  return ''
}

describe('OSS source export', () => {
  it('replaces every protected image, keeps its notice, and leaves originals intact', () => {
    const { root, output } = fixture()
    const result = exportOssSource(root, output)
    expect(result.replaced).toBe(8)
    for (const item of OSS_ASSET_REPLACEMENTS) {
      expect(readFileSync(join(output, item.path))).toEqual(readFileSync(join(output, item.source)))
      expect(readFileSync(join(root, item.path), 'utf8')).toBe('PRIVATE_ARTWORK')
      expect(existsSync(join(output, item.notice))).toBe(true)
      expect(readFileSync(join(output, '.gitattributes'), 'utf8')).not.toContain('/' + item.path + ' export-ignore')
    }
    expect(readFileSync(join(output, 'public/images/home/README.md'), 'utf8')).not.toContain('PRIVATE_ORIGINAL_NOTE')
    expect(readFileSync(join(root, 'public/images/home/README.md'), 'utf8')).toBe('PRIVATE_ORIGINAL_NOTE')
    expect(readFileSync(join(output, 'THIRD_PARTY_NOTICES.md'), 'utf8')).toContain('この公開用sourceに含まれる代替素材')
    expect(existsSync(join(output, '.github/workflows/production.yml'))).toBe(false)
    expect(existsSync(join(output, '.env.local'))).toBe(false)
    expect(JSON.parse(readFileSync(join(output, 'public/OSS_ASSET_MANIFEST.json'), 'utf8')).replacements).toHaveLength(8)
  })
  it('leaves survey operations tooling out of the source archive and keeps the real rule', () => {
    const { root, output } = fixture()
    exportOssSource(root, output)
    expect(existsSync(join(output, 'scripts/monitor-survey'))).toBe(false)
    expect(existsSync(join(output, '.kiro/specs/monitor-survey-gas'))).toBe(false)
    expect(existsSync(join(root, 'scripts/monitor-survey/Code.gs'))).toBe(true)
    const rules = readFileSync(new URL('../../.gitattributes', import.meta.url), 'utf8')
    expect(rules).toContain('/scripts/monitor-survey export-ignore')
    expect(rules).toContain('/.kiro/specs/monitor-survey-gas export-ignore')
  })
  it('rewrites live destinations in the public copy only and records each file', () => {
    const { root, output } = fixture()
    const result = exportOssSource(root, output)
    const sql = readFileSync(join(output, SQL_FIXTURE), 'utf8')
    expect(sql).toContain("v_url := '" + OSS_UNCONFIGURED_BACKEND_URL + "';")
    expect(sql).not.toContain('supabase.co')
    const constants = readFileSync(join(output, 'src/lib/constants.ts'), 'utf8')
    expect(constants).toBe("export const FEEDBACK_FORM_URL = '" + OSS_UNCONFIGURED_BACKEND_URL + "/form'\nexport const MONITOR_SURVEY_URL = '" + OSS_UNCONFIGURED_BACKEND_URL + "/form'\n")
    expect(readFileSync(join(output, 'docs/design.md'), 'utf8')).toBe('Source: [Figma](' + OSS_PRIVATE_LINK_PLACEHOLDER + ') and [assets](' + OSS_PRIVATE_LINK_PLACEHOLDER + ')\n')
    expect(JSON.parse(readFileSync(join(output, '.kiro/specs/demo/spec.json'), 'utf8')).figma_file_url).toBe(OSS_PRIVATE_LINK_PLACEHOLDER)
    // Only SQL is searched for project hosts: prose that mentions one is left alone.
    expect(readFileSync(join(output, 'docs/runbook.md'), 'utf8')).toContain(PROJECT_HOST)
    // The private repository keeps its real values.
    expect(readFileSync(join(root, SQL_FIXTURE), 'utf8')).toContain(PROJECT_HOST)
    expect(readFileSync(join(root, 'src/lib/constants.ts'), 'utf8')).toContain(FORM_URL)
    expect(readFileSync(join(root, 'docs/design.md'), 'utf8')).toContain(FIGMA_URL)
    expect(JSON.parse(readFileSync(join(output, 'public/OSS_ASSET_MANIFEST.json'), 'utf8')).rewritten_references).toEqual({
      'backend-project-url': [SQL_FIXTURE],
      'live-form-endpoint': ['src/lib/constants.ts'],
      'private-document-link': ['.kiro/specs/demo/spec.json', 'docs/design.md'],
    })
    expect(result.rewritten).toBe(4)
  })
  it('stops on live destinations in files no rewrite rule covers, without printing them', () => {
    const { root, output, put, git } = fixture()
    put('scripts/notes.txt', 'Survey: ' + FORM_URL + '\n')
    git('add', '.')
    git('commit', '-qm', 'notes fixture')
    const message = exportError(root, output)
    expect(message).toContain('scripts/notes.txt')
    expect(message).not.toContain('AbCdEf123')
    expect(existsSync(output)).toBe(false)
  })
  it('stops on personal contact addresses without printing them and removes the partial export', () => {
    const { root, output, put, git } = fixture()
    const consumer = 'someone@' + 'gmail.com'
    const academic = 'student@lab.example.' + 'ac.jp'
    const fullWidth = 'student＠lab.example.' + 'ac.jp'
    put('docs/contact.md', 'Contact: ' + consumer + '\n')
    put('docs/lab.md', 'Lab: ' + academic + '\n')
    put('docs/wide.md', 'Lab: ' + fullWidth + '\n')
    writeFileSync(join(root, 'docs/photo.bin'), Buffer.concat([Buffer.from([0, 1, 2]), Buffer.from('meta ' + consumer)]))
    git('add', '.')
    git('commit', '-qm', 'contact fixture')
    const message = exportError(root, output)
    for (const name of ['docs/contact.md', 'docs/lab.md', 'docs/wide.md', 'docs/photo.bin']) expect(message).toContain(name)
    expect(message).not.toContain(consumer)
    expect(message).not.toContain(academic)
    expect(existsSync(output)).toBe(false)
  })
  it('recognises common personal providers and ignores look-alike hosts', () => {
    const personal = ['docomo.ne.jp', 'i.softbank.jp', 'yahoo.ne.jp', 'pm.me', 'hotmail.co.uk', 'me.com', 'mac.com', 'msn.com', 'aol.com', 'protonmail.ch', 'outlook.co.jp', 'x.ac.uk']
    for (const host of personal) expect(OSS_PERSONAL_ADDRESS.test('a@' + host), host).toBe(true)
    expect(OSS_PERSONAL_ADDRESS.test('A.B+tag@' + 'GMAIL.COM')).toBe(true)
    for (const text of ['npm@x.edu-foo.com', 'noreply@users.noreply.github.com', 'ops@zaridasu.com', 'user@test.local', 'a@b.com']) {
      expect(OSS_PERSONAL_ADDRESS.test(text), text).toBe(false)
    }
  })
  it('refuses an existing destination without changing it', () => {
    const { root, output } = fixture()
    mkdirSync(output)
    writeFileSync(join(output, 'sentinel'), 'KEEP')
    expect(() => exportOssSource(root, output)).toThrow('already exists')
    expect(readFileSync(join(output, 'sentinel'), 'utf8')).toBe('KEEP')
  })
  it('refuses uncommitted source changes', () => {
    const { root, output } = fixture()
    writeFileSync(join(root, 'LICENSE'), 'UNCOMMITTED')
    expect(() => exportOssSource(root, output)).toThrow('Commit')
    expect(existsSync(output)).toBe(false)
  })
  it('rejects symlinks before copying replacements and preserves external files', () => {
    const { root, output, directory, git } = fixture()
    const outside = join(directory, 'outside')
    writeFileSync(outside, 'KEEP')
    unlinkSync(join(root, 'public/lp/hero.webp'))
    symlinkSync(outside, join(root, 'public/lp/hero.webp'))
    git('add', '.')
    git('commit', '-qm', 'symlink fixture')
    expect(() => exportOssSource(root, output)).toThrow('symbolic links')
    expect(readFileSync(outside, 'utf8')).toBe('KEEP')
    expect(existsSync(output)).toBe(false)
  })
})
