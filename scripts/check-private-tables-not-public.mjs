// REQ-330 AC-03: 非公開の 4 表（調査計画・地点・つながり・希少種の記録）が公開の経路に出ていないかの見張り。
//
// なぜ要るか: 希少種の記録は、公開の地図・一覧・公開データ・集計 RPC のどこにも出してはいけない。
//   表そのものは RLS と GRANT で本人と管理者に閉じてあるが、RLS を通らない SECURITY DEFINER の関数
//   （集計・ランキング・週報など）や、所有者の権限で動くビューが表を読めば、そこから漏れる。
//   集計 RPC に誰かが「希少種も数えよう」と 1 行足した時点で、ここで止める。
//
// 何を見るか（supabase/schema.sql と supabase/migrations/*.sql の全文）:
//   1. 関数の定義（CREATE FUNCTION の本文・引数・戻り値）に 4 表の名前が出てくる関数
//   2. 4 表に付いたトリガー（CREATE TRIGGER ... ON <表>）が呼ぶ関数（NEW を他の表へ写す抜け道）
//   → 1 と 2 を合わせた集合が、下の許可リストと**一致**しなければ失敗（多くても少なくても）。
//   3. 4 表を参照するビュー → 1 つでもあれば失敗（ビューは RLS を素通りし、Supabase では anon に GRANT される）
//   4. 許可リストのうちトリガー関数でないもの（RPC）は、schema.sql に
//      `REVOKE EXECUTE ON FUNCTION <名前>(...) FROM PUBLIC, anon` が無ければ失敗
//
//   5. 公開の経路のコード（supabase/functions の Edge Functions・src/app/api・src/app 配下の route.ts）に
//      4 表と写真置き場 rare-photos の名前が出てきたら失敗（service_role で動くので RLS が効かない）
//
// 見ないもの: DO ブロックの中で動的に作る関数、ポリシー（表を絞る側なので漏れ口ではない）、
// テストのファイル、コードのコメントの中の名前。
//
// 使い方: node scripts/check-private-tables-not-public.mjs [--root <リポジトリのルート>]
//   CI の test ジョブと scripts/precheck.mjs から `npm run private-tables:check` で呼ぶ。

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { stripSqlComments } from './normalize-migration-sql.mjs'

export const PRIVATE_TABLES = ['survey_plans', 'survey_plan_stops', 'survey_stop_posts', 'rare_sightings', 'water_reports']

/**
 * 4 表に触れてよい関数。足すときは「anon が実行できないこと」と「公開の経路へ行を返さないこと」を
 * 確かめてから、理由を添えて足す。名前は schema を外した小文字。
 */
export const ALLOWED_FUNCTIONS = {
  reorder_survey_plan_stops: '本人用 RPC（SECURITY INVOKER・RLS のまま・anon は EXECUTE 不可）',
  check_survey_plan_rate_limit: '計画の上限トリガー（件数を数えるだけ）',
  check_survey_plan_stop_rate_limit: '地点の上限トリガー（件数を数えるだけ）',
  check_rare_sighting_rate_limit: '希少種の記録の上限トリガー（件数を数えるだけ）',
  protect_survey_plan_columns: 'UPDATE で所有者などを旧値に戻すトリガー',
  protect_survey_plan_stop_columns: 'UPDATE で所有者・計画などを旧値に戻すトリガー',
  protect_rare_sighting_columns: 'UPDATE で所有者・client_id などを旧値に戻すトリガー',
  check_rare_sighting_photo_paths: '写真のパスが自分のフォルダかを確かめるトリガー',
  update_updated_at: '既存の共通トリガー（updated_at を今にするだけ）',
  check_water_report_input: '非公開水域報告の入力・本人フォルダの写真パスを検証するトリガー',
  check_water_report_rate_limit: '非公開水域報告の件数制限トリガー（件数を数えるだけ）',
  review_water_report: 'admin 検証付き審査 RPC。公開投影は確認済み名称と粗化座標のみ、anon EXECUTE 不可',
  delete_water_report_publication: '報告削除に連動して対応する公開投影を消すトリガー',
  pin_created_at_on_client_write: '一般ユーザーの INSERT で created_at を受付時刻にし、UPDATE で旧値に戻すだけのトリガー（他の表を読まず、NEW を他へ写さない。security-hardening 要件3）',
}

const TABLE_PATTERN = new RegExp(`(?<![\\w$])(?:public\\.)?"?(${PRIVATE_TABLES.join('|')})"?(?![\\w$])`, 'i')
const NAME = '((?:"?[A-Za-z_][\\w$]*"?\\.)?"?[A-Za-z_][\\w$]*"?)'
const FUNCTION_RE = new RegExp(`^CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+${NAME}\\s*\\(`, 'i')
const TRIGGER_RE = new RegExp(
  `^CREATE\\s+(?:OR\\s+REPLACE\\s+)?(?:CONSTRAINT\\s+)?TRIGGER\\s+[\\s\\S]*?\\bON\\s+${NAME}[\\s\\S]*?` +
    `\\bEXECUTE\\s+(?:FUNCTION|PROCEDURE)\\s+${NAME}\\s*\\(`,
  'i'
)
const VIEW_RE = new RegExp(
  `^CREATE\\s+(?:OR\\s+REPLACE\\s+)?(?:TEMP(?:ORARY)?\\s+)?(?:RECURSIVE\\s+)?(?:MATERIALIZED\\s+)?VIEW\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${NAME}`,
  'i'
)

/** schema を外して小文字にした名前（"public"."Foo" → foo）。 */
export function bareName(name) {
  const last = name.split('.').pop() ?? name
  return last.replace(/"/g, '').toLowerCase()
}

/**
 * SQL を文に分ける（引用符・ドル引用・行コメント・ブロックコメントの中の ; では切らない）。
 * line は文の最初のコード行（空行と -- の行を飛ばした行）の行番号。
 */
export function splitStatements(sql) {
  const statements = []
  let start = 0
  let i = 0
  let counted = 0
  let lineAtStart = 1
  const push = (end) => {
    const text = sql.slice(start, end)
    for (; counted < start; counted++) if (sql[counted] === '\n') lineAtStart++
    if (text.trim()) {
      const lines = text.split('\n')
      const first = lines.findIndex((l) => l.trim() !== '' && !l.trim().startsWith('--'))
      statements.push({ text, line: lineAtStart + Math.max(first, 0) })
    }
    start = end
  }
  while (i < sql.length) {
    const c = sql[i]
    const n = sql[i + 1]
    if (c === '-' && n === '-') {
      const eol = sql.indexOf('\n', i)
      i = eol === -1 ? sql.length : eol
    } else if (c === '/' && n === '*') {
      let depth = 1
      i += 2
      while (i < sql.length && depth > 0) {
        if (sql[i] === '/' && sql[i + 1] === '*') { depth++; i += 2 } else if (sql[i] === '*' && sql[i + 1] === '/') { depth--; i += 2 } else i++
      }
    } else if (c === "'" || c === '"') {
      i++
      while (i < sql.length) {
        if (sql[i] === c && sql[i + 1] === c) i += 2
        else if (sql[i] === c) { i++; break } else i++
      }
    } else if (c === '$' && !/[\w$]/.test(sql[i - 1] ?? '')) {
      const tag = sql.slice(i).match(/^\$(?:[A-Za-z_][\w]*)?\$/)?.[0]
      if (tag) {
        const close = sql.indexOf(tag, i + tag.length)
        i = close === -1 ? sql.length : close + tag.length
      } else i++
    } else if (c === ';') {
      push(i + 1)
      i++
    } else i++
  }
  push(sql.length)
  return statements
}

/** コメントを外す。関数本文（$...$ の中）のコメントも外す（本文の注釈に表の名前を書いても引っかけない）。 */
function codeOf(statement) {
  const outer = stripSqlComments(statement)
  return outer.replace(/\$([A-Za-z_]\w*)?\$([\s\S]*?)\$\1\$/g, (_m, tag = '', body) => `$${tag}$${stripSqlComments(body)}$${tag}$`)
}

/** 1 ファイル分を調べる。 */
export function scanSql(path, sql) {
  const functions = []
  const triggers = []
  const views = []
  for (const { text, line } of splitStatements(sql)) {
    const code = codeOf(text).trim()
    const fn = code.match(FUNCTION_RE)
    if (fn) {
      if (TABLE_PATTERN.test(code)) {
        functions.push({ name: bareName(fn[1]), where: `${path}:${line}`, returnsTrigger: /\bRETURNS\s+TRIGGER\b/i.test(code) })
      }
      continue
    }
    const tg = code.match(TRIGGER_RE)
    if (tg) {
      const table = bareName(tg[1])
      if (PRIVATE_TABLES.includes(table)) triggers.push({ name: bareName(tg[2]), table, where: `${path}:${line}` })
      continue
    }
    const view = code.match(VIEW_RE)
    if (view && TABLE_PATTERN.test(code)) views.push({ name: bareName(view[1]), where: `${path}:${line}` })
  }
  return { functions, triggers, views }
}

/** 調べた結果を許可リストと突き合わせ、問題を文で返す（空なら合格）。 */
export function checkFindings(findings, schemaSql, allowed = ALLOWED_FUNCTIONS) {
  const problems = []
  const found = new Map()
  for (const f of findings.functions) {
    const entry = found.get(f.name) ?? { where: [], via: new Set(), returnsTrigger: f.returnsTrigger }
    entry.where.push(f.where)
    entry.via.add('本文で表を参照')
    entry.returnsTrigger = entry.returnsTrigger && f.returnsTrigger
    found.set(f.name, entry)
  }
  for (const t of findings.triggers) {
    const entry = found.get(t.name) ?? { where: [], via: new Set(), returnsTrigger: true }
    entry.where.push(t.where)
    entry.via.add(`${t.table} のトリガー`)
    found.set(t.name, entry)
  }
  for (const [name, entry] of found) {
    if (!(name in allowed)) {
      problems.push(
        `許可リストに無い関数 ${name} が非公開の表に触れています（${[...entry.via].join('・')}）: ${entry.where.join(', ')}\n` +
          '    公開の経路（集計・ランキング・公開データなど）へ希少種の記録が出ていないか確かめてください。' +
          '本人用・管理者用で anon が実行できないなら、理由を添えて ALLOWED_FUNCTIONS に足します。'
      )
    }
  }
  for (const name of Object.keys(allowed)) {
    if (!found.has(name)) {
      problems.push(`許可リストの ${name} が見つかりません。関数を消した・改名したなら許可リストも直してください。`)
    }
  }
  for (const v of findings.views) {
    problems.push(`ビュー ${v.name} が非公開の表を参照しています（RLS を素通りし anon に GRANT されうる）: ${v.where}`)
  }
  for (const [name, entry] of found) {
    if (!(name in allowed) || entry.returnsTrigger) continue
    const revoke = new RegExp(`^REVOKE\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+(?:public\\.)?${name}\\s*\\([^)]*\\)\\s+FROM\\s+([^;]*);`, 'im')
    const from = schemaSql.match(revoke)?.[1] ?? ''
    if (!/\bPUBLIC\b/i.test(from) || !/\banon\b/i.test(from)) {
      problems.push(`RPC ${name} の EXECUTE を anon から外す行（REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC, anon）が schema.sql にありません。`)
    }
  }
  return problems
}

/** 公開の経路のコードに出てきてはいけない名前（4 表と写真置き場）。 */
export const PRIVATE_NAMES = [...PRIVATE_TABLES, 'rare-photos', 'water-report-photos']
/** 丸ごと見るフォルダ（Edge Functions は service_role で動く。src/app/api はサーバーのルート）。 */
const CODE_DIRS = ['supabase/functions', 'src/app/api']
const CODE_EXT = /\.(?:[cm]?[jt]sx?)$/
const TEST_FILE = /(?:^|\/)__tests__\/|\.(?:test|spec)\.[cm]?[jt]sx?$/
const NAME_PATTERN = new RegExp(`(?<![\\w$-])(${PRIVATE_NAMES.map((n) => n.replace(/-/g, '\\-')).join('|')})(?![\\w$-])`)

/** // と /* *\/ のコメントを外す（文字列の中の // は残す。名前は文字列の中に出てくるので文字列は消さない）。 */
export function stripCodeComments(source) {
  let out = ''
  let i = 0
  while (i < source.length) {
    const c = source[i]
    const n = source[i + 1]
    if (c === '/' && n === '/') {
      const eol = source.indexOf('\n', i)
      i = eol === -1 ? source.length : eol
    } else if (c === '/' && n === '*') {
      const end = source.indexOf('*/', i + 2)
      const stop = end === -1 ? source.length : end + 2
      // 行番号がずれないよう、コメントの中の改行は残す
      out += source.slice(i, stop).replace(/[^\n]/g, '')
      i = stop
    } else if (c === "'" || c === '"' || c === '`') {
      const start = i
      i++
      while (i < source.length && source[i] !== c) i += source[i] === '\\' ? 2 : 1
      i++
      out += source.slice(start, i)
    } else {
      out += c
      i++
    }
  }
  return out
}

/** 1 ファイル分のコードを調べ、出てきた名前と行を返す。 */
export function scanCode(path, source) {
  const found = []
  stripCodeComments(source)
    .split('\n')
    .forEach((line, index) => {
      const hit = line.match(NAME_PATTERN)
      if (hit) found.push({ name: hit[1], where: `${path}:${index + 1}` })
    })
  return found
}

function walk(dir, out) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

/** 公開の経路のコードの一覧（テストは除く）。src/app 配下は route.ts（公開データの CSV など）も見る。 */
export function listPublicCodeFiles(root) {
  const files = new Set()
  for (const dir of CODE_DIRS) {
    const full = join(root, dir)
    if (!existsSync(full)) continue
    for (const f of walk(full, [])) files.add(f)
  }
  const app = join(root, 'src', 'app')
  if (existsSync(app)) {
    for (const f of walk(app, [])) if (/(?:^|\/)route\.[jt]sx?$/.test(f)) files.add(f)
  }
  return [...files]
    .map((f) => relative(root, f).split('\\').join('/'))
    .filter((f) => CODE_EXT.test(f) && !TEST_FILE.test(f))
    .sort()
}

/** リポジトリを調べる。 */
export function checkRepository(root) {
  const migrationsDir = join(root, 'supabase', 'migrations')
  const files = [
    'supabase/schema.sql',
    ...readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort().map((f) => `supabase/migrations/${f}`),
  ]
  const findings = { functions: [], triggers: [], views: [] }
  for (const file of files) {
    const r = scanSql(file, readFileSync(join(root, file), 'utf8'))
    findings.functions.push(...r.functions)
    findings.triggers.push(...r.triggers)
    findings.views.push(...r.views)
  }
  const schemaSql = readFileSync(join(root, 'supabase', 'schema.sql'), 'utf8')
  const problems = checkFindings(findings, schemaSql)
  const codeFiles = listPublicCodeFiles(root)
  for (const file of codeFiles) {
    for (const hit of scanCode(file, readFileSync(join(root, file), 'utf8'))) {
      problems.push(
        `公開の経路のコードに ${hit.name} が出てきます: ${hit.where}\n` +
          '    Edge Functions とサーバーのルートは RLS の効かない権限で動くことがあります。非公開の記録・写真を読まないでください。'
      )
    }
  }
  return { files, codeFiles, findings, problems }
}

function main() {
  const rootIndex = process.argv.indexOf('--root')
  const root = resolve(rootIndex !== -1 ? process.argv[rootIndex + 1] : process.cwd())
  const { files, codeFiles, findings, problems } = checkRepository(root)
  const names = [...new Set([...findings.functions, ...findings.triggers].map((f) => f.name))].sort()
  console.log(`[private-tables] ${files.length} ファイルを調べました（対象の表: ${PRIVATE_TABLES.join(', ')}）`)
  console.log(`[private-tables] 公開の経路のコード ${codeFiles.length} ファイルを調べました（${PRIVATE_NAMES.join(', ')} の名前）`)
  console.log(`[private-tables] 表に触れる関数: ${names.length} 本（${names.join(', ')}）`)
  if (problems.length > 0) {
    for (const p of problems) console.error(`[private-tables] NG: ${p}`)
    console.error(`\n[private-tables] ${problems.length} 件の問題があります。`)
    process.exit(1)
  }
  console.log('[private-tables] OK: 非公開の表に触れる関数は許可リストと一致し、ビューと公開の経路のコードからの参照もありません。')
}

const isDirectExecution = process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url

if (isDirectExecution) main()
