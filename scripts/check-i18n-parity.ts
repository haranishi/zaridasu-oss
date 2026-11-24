#!/usr/bin/env -S npx tsx
/**
 * REQ-114: i18n 未翻訳キーの自動検出
 *
 * src/locales/<lang>/translation.json のキーセットを言語間で比較し、
 * 差分があれば exit 1 で fail する CI スクリプト。
 *
 * - base 言語: ja
 * - 比較対象: en, ko, zh
 * - フラット化したキー（例: "header.skipToMain"）で diff を取る
 *
 * 使い方:
 *   npm run i18n:check
 *   npx tsx scripts/check-i18n-parity.ts
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

type AnyJson = Record<string, unknown>

const BASE_LANG = 'ja'
const TARGET_LANGS = ['en', 'ko', 'zh'] as const
const LOCALES_DIR = 'src/locales'
// 現状は単一ネームスペース。将来 namespace を増やしたらここに追加する。
const NAMESPACES = ['translation.json'] as const

function flatten(obj: unknown, prefix = ''): string[] {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return [prefix.replace(/\.$/, '')]
  }
  return Object.entries(obj as AnyJson).flatMap(([k, v]) =>
    v !== null && typeof v === 'object' && !Array.isArray(v)
      ? flatten(v, `${prefix}${k}.`)
      : [`${prefix}${k}`],
  )
}

function loadKeys(lang: string, ns: string): Set<string> {
  const path = join(LOCALES_DIR, lang, ns)
  const raw = readFileSync(path, 'utf8')
  return new Set(flatten(JSON.parse(raw)))
}

let totalDiff = 0
const langs = [BASE_LANG, ...TARGET_LANGS]

for (const ns of NAMESPACES) {
  const baseKeys = loadKeys(BASE_LANG, ns)
  for (const lang of TARGET_LANGS) {
    const langKeys = loadKeys(lang, ns)
    const onlyBase = [...baseKeys].filter((k) => !langKeys.has(k)).sort()
    const onlyLang = [...langKeys].filter((k) => !baseKeys.has(k)).sort()

    if (onlyBase.length === 0 && onlyLang.length === 0) {
      console.log(`[i18n] ${ns} ${BASE_LANG} <-> ${lang}: OK (${baseKeys.size} keys)`)
      continue
    }

    totalDiff += onlyBase.length + onlyLang.length
    console.error(
      `[i18n] ${ns} ${BASE_LANG} <-> ${lang}: ` +
        `${BASE_LANG}-only=${onlyBase.length}, ${lang}-only=${onlyLang.length}`,
    )
    if (onlyBase.length) {
      console.error(`  ${BASE_LANG}-only:`)
      for (const k of onlyBase) console.error(`    - ${k}`)
    }
    if (onlyLang.length) {
      console.error(`  ${lang}-only:`)
      for (const k of onlyLang) console.error(`    - ${k}`)
    }
  }
}

if (totalDiff > 0) {
  console.error(`\n[i18n] ${totalDiff} key(s) missing across ${langs.join('/')}`)
  process.exit(1)
}

console.log(`\n[i18n] OK: ${langs.join('/')} parity verified.`)
