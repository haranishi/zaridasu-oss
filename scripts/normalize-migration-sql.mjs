import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'

function dollarQuoteDelimiterAt(sql, index) {
  const previous = sql[index - 1]
  if (previous !== undefined && /[A-Za-z0-9_$]/.test(previous)) return null
  return sql.slice(index).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0] ?? null
}

function isEscapeStringStart(sql, quoteIndex) {
  const prefix = sql[quoteIndex - 1]
  if (prefix !== 'E' && prefix !== 'e') return false

  const beforePrefix = sql[quoteIndex - 2]
  return beforePrefix === undefined || !/[A-Za-z0-9_$]/.test(beforePrefix)
}

/**
 * SQL のコメントだけを除去する。
 * PostgreSQL の引用領域は内容として意味を持つため、状態機械で保護する。
 */
export function stripSqlComments(sql) {
  let result = ''
  let index = 0
  let state = 'normal'
  let dollarDelimiter = ''
  let escapeString = false

  while (index < sql.length) {
    const char = sql[index]
    const next = sql[index + 1]

    if (state === 'single-quote') {
      result += char
      if (escapeString && char === '\\' && next !== undefined) {
        result += next
        index += 2
        continue
      }
      if (char === "'" && next === "'") {
        result += next
        index += 2
        continue
      }
      if (char === "'") {
        state = 'normal'
        escapeString = false
      }
      index += 1
      continue
    }

    if (state === 'double-quote') {
      result += char
      if (char === '"' && next === '"') {
        result += next
        index += 2
        continue
      }
      if (char === '"') state = 'normal'
      index += 1
      continue
    }

    if (state === 'dollar-quote') {
      if (sql.startsWith(dollarDelimiter, index)) {
        result += dollarDelimiter
        index += dollarDelimiter.length
        state = 'normal'
        dollarDelimiter = ''
      } else {
        result += char
        index += 1
      }
      continue
    }

    if (char === "'") {
      escapeString = isEscapeStringStart(sql, index)
      state = 'single-quote'
      result += char
      index += 1
      continue
    }

    if (char === '"') {
      state = 'double-quote'
      result += char
      index += 1
      continue
    }

    if (char === '$') {
      const delimiter = dollarQuoteDelimiterAt(sql, index)
      if (delimiter !== null) {
        state = 'dollar-quote'
        dollarDelimiter = delimiter
        result += delimiter
        index += delimiter.length
        continue
      }
    }

    if (char === '-' && next === '-') {
      result += ' '
      index += 2
      while (index < sql.length && sql[index] !== '\n' && sql[index] !== '\r') index += 1
      continue
    }

    if (char === '/' && next === '*') {
      result += ' '
      index += 2
      let depth = 1
      while (index < sql.length && depth > 0) {
        if (sql[index] === '/' && sql[index + 1] === '*') {
          depth += 1
          index += 2
        } else if (sql[index] === '*' && sql[index + 1] === '/') {
          depth -= 1
          index += 2
        } else {
          index += 1
        }
      }
      continue
    }

    result += char
    index += 1
  }

  return result
}

export function normalizeSql(sql) {
  // 本番・リポジトリの両側へ同じ処理をする比較専用の正規化なので、
  // 引用領域内も含め、空白とセミコロン周辺の表記差を一律に吸収する。
  return stripSqlComments(sql)
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(/ *; */g, ';')
    .replace(/;$/, '')
}

export function hashSql(sql) {
  return createHash('sha256').update(normalizeSql(sql), 'utf8').digest('hex')
}

function readIgnoredVersions(ignorePath) {
  if (!existsSync(ignorePath)) return new Set()

  const versions = readFileSync(ignorePath, 'utf8')
    .split(/\r?\n/u)
    .map((line) => line.replace(/#.*$/u, '').trim())
    .filter(Boolean)
  return new Set(versions)
}

function findMigrationFile(fileNames, version) {
  const prefix = `${version}_`
  return fileNames.find((fileName) => fileName === `${version}.sql` || (
    fileName.startsWith(prefix) && fileName.endsWith('.sql')
  ))
}

function compareMigrations(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('入力は JSON オブジェクトである必要があります')
  }
  if (input.prod === null || typeof input.prod !== 'object' || Array.isArray(input.prod)) {
    throw new TypeError('prod は version をキーに持つ JSON オブジェクトである必要があります')
  }

  const repoDir = typeof input.repoDir === 'string'
    ? input.repoDir
    : 'supabase/migrations'
  const ignoreFile = typeof input.ignoreFile === 'string'
    ? input.ignoreFile
    : 'supabase/ci/migration-drift-ignore.txt'
  const absoluteRepoDir = resolve(process.cwd(), repoDir)
  const absoluteIgnoreFile = resolve(process.cwd(), ignoreFile)
  const fileNames = readdirSync(absoluteRepoDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort()
  const ignoredVersions = readIgnoredVersions(absoluteIgnoreFile)

  const output = {
    checked: 0,
    drift: [],
    missingFile: [],
    ignored: [],
  }

  for (const [version, prodSql] of Object.entries(input.prod).sort(([a], [b]) => a.localeCompare(b))) {
    if (typeof prodSql !== 'string') {
      throw new TypeError(`prod.${version} は文字列である必要があります`)
    }
    if (ignoredVersions.has(version)) {
      output.ignored.push(version)
      continue
    }

    const fileName = findMigrationFile(fileNames, version)
    if (fileName === undefined) {
      output.missingFile.push(version)
      continue
    }

    const repoSql = readFileSync(join(absoluteRepoDir, fileName), 'utf8')
    const prodHash = hashSql(prodSql)
    const repoHash = hashSql(repoSql)
    output.checked += 1
    if (prodHash !== repoHash) {
      output.drift.push({
        version,
        file: join(repoDir, fileName),
        prodHash,
        repoHash,
      })
    }
  }

  return output
}

async function runCli() {
  // ⚠️ chunk は Buffer なので、**必ず全チャンクを連結してから** 1 度だけ文字列化する。
  //   `rawInput += chunk` のようにチャンクごとに toString() すると、UTF-8 のマルチバイト文字が
  //   チャンク境界（パイプでは 64KiB 前後の任意バイト位置）で分断されたときに、その文字が
  //   U+FFFD（置換文字）へ化ける。分断が起きる位置は実行ごとに変わるため、
  //   **本番の migration がランダムに「内容ドリフトあり」と誤検知される**（2026-08-03 に実測。
  //   同じ入力でも実行のたびに壊れる migration が変わり、20260615000004 / 20260703000005 で発生）。
  //   ここは本番デプロイをブロックするゲートなので、偽陽性は許容できない。
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  const rawInput = Buffer.concat(chunks).toString('utf8')
  const input = JSON.parse(rawInput)
  process.stdout.write(`${JSON.stringify(compareMigrations(input))}\n`)
}

const isDirectExecution = process.argv[1] !== undefined
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url

if (isDirectExecution) {
  runCli().catch((error) => {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`normalize-migration-sql: ${message}\n`)
    process.exitCode = 1
  })
}
