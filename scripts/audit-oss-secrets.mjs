import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, realpathSync, writeFileSync, rmSync, mkdirSync, lstatSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

// Supplemental release audit; no revocation, history rewrite or network access.
const root = realpathSync(fileURLToPath(new URL('..', import.meta.url)))
const temporary = mkdtempSync(join(tmpdir(), 'zaridasu-oss-audit-'))
const history = process.argv.includes('--history')
const directoryFlag = process.argv.indexOf('--directory')
const directory = directoryFlag >= 0 ? process.argv[directoryFlag + 1] : undefined
try {
  if ((directoryFlag >= 0 && !directory) || (directory && history)) throw new Error('Choose either history or a source directory.')
  const ignore = join(temporary, '.gitleaksignore')
  const report = join(temporary, 'report.json')
  writeFileSync(ignore, '', { mode: 0o600 })
  let source = directory ? realpathSync(directory) : root
  if (directory && !lstatSync(source).isDirectory()) throw new Error('The audit target must be a directory.')
  if (!history && !directory) {
    // Audit only publishable source, never ignored local credentials or runtime data.
    const listed = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
      cwd: root, encoding: 'utf8',
    })
    if (listed.error || listed.status !== 0) throw new Error('Could not enumerate source files; audit did not complete.')
    source = join(temporary, 'source')
    mkdirSync(source)
    for (const file of new Set(listed.stdout.split('\0').filter(Boolean))) {
      const input = join(root, file)
      if (!lstatSync(input).isFile()) throw new Error('Source contains a non-regular file; review it before publishing.')
      const output = join(source, file)
      mkdirSync(dirname(output), { recursive: true })
      writeFileSync(output, readFileSync(input))
    }
  }
  const scan = spawnSync('gitleaks', [
    history ? 'git' : 'dir',
    ...(history ? ['--log-opts=--all'] : []),
    '--config', join(root, '.gitleaks-oss.toml'),
    '--gitleaks-ignore-path', ignore,
    '--ignore-gitleaks-allow', '--redact=100', '--no-banner', '--no-color',
    '--report-format=json', '--report-path', report, source,
  ], { cwd: root, encoding: 'utf8' })
  if (scan.error || ![0, 1].includes(scan.status)) {
    console.error('OSS audit did not complete. Install gitleaks v8 and rerun; this is not a passing result.')
    process.exitCode = 2
  } else {
    let findings
    try { findings = JSON.parse(readFileSync(report, 'utf8')) }
    catch { throw new Error('OSS audit report is missing or invalid; no passing result can be issued.') }
    console.log(JSON.stringify({
      scope: history ? 'all local Git refs' : directory ? 'exported source directory' : 'Git-managed source and non-ignored new files',
      findings: findings.map(({ RuleID, File, StartLine, Commit }) => ({
        rule: RuleID, file: File.startsWith(source) ? relative(source, File) : File, line: StartLine, commit: Commit,
      })),
    }, null, 2))
    process.exitCode = findings.length ? 1 : scan.status
  }
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
