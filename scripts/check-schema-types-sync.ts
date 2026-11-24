#!/usr/bin/env -S npx tsx
/**
 * REQ-148: スキーマ (schema.sql) と生成型 (database.types.ts) の許容値同期チェック
 *
 * 手書きメンテされている src/types/database.types.ts の literal union が、
 * supabase/schema.sql の CHECK 制約と乖離していないかを検証する CI スクリプト。
 * 乖離があれば exit 1 で fail する。
 *
 * 既存の `schema-drift` ジョブ（型生成の smoke + informational diff）は string 型
 * との機械 diff のため fail させられないが、本チェックは「CHECK 制約で列挙された
 * 許容値」と「型の literal union」の集合一致のみを厳密に照合する。
 *
 * 使い方:
 *   npm run schema:check
 *   npx tsx scripts/check-schema-types-sync.ts
 */

import { readFileSync } from 'node:fs'

const SCHEMA_PATH = 'supabase/schema.sql'
const TYPES_PATH = 'src/types/database.types.ts'

interface Check {
  /** 表示用の名前 */
  label: string
  /** schema.sql 内の `<column> IN (...)` の column 名 */
  column: string
  /**
   * 表を指定すると、その表の CREATE TABLE / ALTER TABLE の中だけを見る（型は同じ表の Row だけを見る）。
   * status / source / location_source のように**同じ列名が別の表にもある**列はこれで照合する
   * （REQ-330: posts.location_source と rare_sightings.location_source は許容値が違う）。
   */
  table?: string
  /** database.types.ts の Row 定義から union を抜く正規表現（capture group 1 = union 本体）。table 指定時は不要 */
  typeRegex?: RegExp
}

// 注: 列名はテーブル間で衝突しうる（例: species は posts と survey_requests で
// 許容値が異なる）。table を書かない行は、アプリ全体で許容値が一意に定まる列だけを対象とする。
// info_type は posts 固有、reason は IN 制約を持つのが reports のみで一意。
const CHECKS: Check[] = [
  { label: 'user_onboarding.region', column: 'region', typeRegex: /\bregion:\s*([^\n]+)/ },
  { label: 'user_onboarding.seen_crayfish', column: 'seen_crayfish', typeRegex: /\bseen_crayfish:\s*([^\n]+)/ },
  {
    label: 'posts.info_type',
    column: 'info_type',
    typeRegex: /\binfo_type:\s*([^\n]+)/,
  },
  {
    label: 'reports.reason',
    column: 'reason',
    typeRegex: /\breason:\s*([^\n]+)/,
  },
  // REQ-330: 調査計画と希少種の記録
  { label: 'survey_plans.status', table: 'survey_plans', column: 'status' },
  { label: 'survey_plan_stops.status', table: 'survey_plan_stops', column: 'status' },
  { label: 'survey_plan_stops.source', table: 'survey_plan_stops', column: 'source' },
  { label: 'survey_stop_posts.kind', table: 'survey_stop_posts', column: 'kind' },
  { label: 'rare_sightings.location_source', table: 'rare_sightings', column: 'location_source' },
  { label: 'water_reports.status', table: 'water_reports', column: 'status' },
]

/** schema.sql から `<column> ... IN ('a', 'b', ...)` の最後の出現を抜き、許容値集合を返す */
function schemaAllowed(sql: string, column: string): Set<string> | null {
  // CHECK (... <column> IN ('a','b',...)) を全件拾い、最後（最新の制約再定義）を採用する。
  const re = new RegExp(`${column}\\s+IN\\s*\\(([^)]*)\\)`, 'gi')
  let m: RegExpExecArray | null
  let last: string | null = null
  while ((m = re.exec(sql)) !== null) last = m[1] ?? null
  if (last == null) return null
  return new Set(
    [...last.matchAll(/'([^']*)'/g)].flatMap((x) => x[1] == null ? [] : [x[1]]),
  )
}

/** `(` の位置から対応する `)` の位置を返す（'...' の中の括弧は数えない）。見つからなければ -1。 */
function matchParen(text: string, open: number): number {
  let depth = 0
  let inQuote = false
  for (let i = open; i < text.length; i++) {
    const c = text[i]
    if (inQuote) {
      if (c === "'") {
        if (text[i + 1] === "'") i++
        else inQuote = false
      }
      continue
    }
    if (c === "'") inQuote = true
    else if (c === '(') depth++
    else if (c === ')' && --depth === 0) return i
  }
  return -1
}

/**
 * 表を限定した版。schema.sql のうち、その表の CREATE TABLE の列定義と ALTER TABLE 文の中だけで
 * 列の CHECK を探す。関数本体の `status IN (...)` や、別の表の同名列を拾わない。
 * `CHECK (<col> IN (...))` と `CHECK (<col> IS NULL OR <col> IN (...))` の形だけを見るので、
 * `(source_id IS NOT NULL) = (source = ...)` のような複合の制約も拾わない。
 */
function schemaAllowedInTable(sql: string, table: string, column: string): Set<string> | null {
  const name = `(?:public\\.)?"?${table}"?`
  const segments: string[] = []
  const createRe = new RegExp(`CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${name}\\s*\\(`, 'gi')
  let m: RegExpExecArray | null
  while ((m = createRe.exec(sql)) !== null) {
    const open = m.index + m[0].length - 1
    const close = matchParen(sql, open)
    if (close !== -1) segments.push(sql.slice(open, close + 1))
  }
  const alterRe = new RegExp(`ALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(?:ONLY\\s+)?${name}\\s[^;]*;`, 'gi')
  while ((m = alterRe.exec(sql)) !== null) segments.push(m[0])
  const checkRe = new RegExp(
    `CHECK\\s*\\(\\s*(?:${column}\\s+IS\\s+NULL\\s+OR\\s+)?${column}\\s+IN\\s*\\(([^)]*)\\)`,
    'gi',
  )
  let last: string | null = null
  for (const seg of segments) {
    while ((m = checkRe.exec(seg)) !== null) last = m[1] ?? null
  }
  if (last == null) return null
  return new Set([...last.matchAll(/'([^']*)'/g)].flatMap((x) => (x[1] == null ? [] : [x[1]])))
}

/** database.types.ts の literal union 文字列から値集合を返す */
function typeAllowed(types: string, regex: RegExp): Set<string> | null {
  const m = types.match(regex)
  if (!m) return null
  const union = m[1]
  if (union == null) return null
  return new Set([...union.matchAll(/'([^']*)'/g)].flatMap((x) => x[1] == null ? [] : [x[1]]))
}

/** 表を限定した版。`<table>: {` の中の `Row: { ... }` だけで列の union を探す。 */
function typeAllowedInTable(types: string, table: string, column: string): Set<string> | null {
  const start = types.search(new RegExp(`\\n\\s+${table}:\\s*\\{`))
  if (start === -1) return null
  const rowAt = types.indexOf('Row: {', start)
  if (rowAt === -1) return null
  const rowEnd = types.indexOf('}', rowAt)
  if (rowEnd === -1) return null
  return typeAllowed(types.slice(rowAt, rowEnd), new RegExp(`\\b${column}:\\s*([^\\n]+)`))
}

function eq(a: Set<string>, b: Set<string>): boolean {
  return a.size === b.size && [...a].every((v) => b.has(v))
}

const sql = readFileSync(SCHEMA_PATH, 'utf8')
const types = readFileSync(TYPES_PATH, 'utf8')

let failures = 0
for (const c of CHECKS) {
  const fromSchema = c.table ? schemaAllowedInTable(sql, c.table, c.column) : schemaAllowed(sql, c.column)
  const fromType = c.table
    ? typeAllowedInTable(types, c.table, c.column)
    : c.typeRegex
      ? typeAllowed(types, c.typeRegex)
      : null

  if (!fromSchema) {
    console.error(`[schema-sync] ${c.label}: schema.sql に CHECK (... ${c.column} IN (...)) が見つかりません`)
    failures++
    continue
  }
  if (!fromType) {
    console.error(`[schema-sync] ${c.label}: database.types.ts に ${c.column} の union が見つかりません`)
    failures++
    continue
  }

  if (eq(fromSchema, fromType)) {
    console.log(`[schema-sync] ${c.label}: OK (${[...fromSchema].sort().join(', ')})`)
    continue
  }

  failures++
  const onlySchema = [...fromSchema].filter((v) => !fromType.has(v)).sort()
  const onlyType = [...fromType].filter((v) => !fromSchema.has(v)).sort()
  console.error(`[schema-sync] ${c.label}: 不一致`)
  if (onlySchema.length) console.error(`  schema.sql のみ: ${onlySchema.join(', ')}`)
  if (onlyType.length) console.error(`  database.types.ts のみ: ${onlyType.join(', ')}`)
}

if (failures > 0) {
  console.error(`\n[schema-sync] ${failures} 件の不整合があります。database.types.ts を schema.sql に合わせてください。`)
  process.exit(1)
}

console.log('\n[schema-sync] OK: schema.sql と database.types.ts の許容値が一致しています。')
